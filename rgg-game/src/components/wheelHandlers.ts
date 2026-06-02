import {
  collection,
  doc,
  getDoc,
  getDocs,
  arrayUnion,
  runTransaction,
} from "firebase/firestore";
import { db } from "../firebase";
import { removeOneCardFromInventory } from "./cardHandlers";
import type { ToastNotification } from "./useModalStates";

type Notify = (message: string, type?: ToastNotification["type"], cardId?: string) => void;

export type WheelCardStackEntry = {
  cardId: "inv_017" | "inv_006";
  playerId: string;
  previousWinnerIndex: number;
  resultWinnerIndex: number;
  timestamp: number;
};

export type WheelSettings = {
  isSpinning?: boolean;
  targetRotation?: number;
  winnerIndex?: number | null;
  previousWinnerIndex?: number | null;
  previousTargetRotation?: number | null;
  wheelCardStack?: WheelCardStackEntry[];
  lastSpinSource?: string;
};

export const buildWheelSpinPayload = (
  itemCount: number,
  currentRotation: number,
  previousWinnerIndex: number | null,
  source: "admin" | "participant_reroll" | "inv_017",
  playerId?: string,
) => {
  const selectedIndex = Math.floor(Math.random() * itemCount);
  const angleStep = 360 / itemCount;
  const targetSegmentCenter = selectedIndex * angleStep + angleStep / 2;
  const currentRotationDegrees = currentRotation % 360;
  const extraDegrees = (270 - currentRotationDegrees - targetSegmentCenter + 1440) % 360;
  const targetRotation = currentRotation + 1800 + extraDegrees;

  return {
    isSpinning: true,
    targetRotation,
    winnerIndex: selectedIndex,
    previousWinnerIndex,
    previousTargetRotation: currentRotation,
    lastSpinSource: source,
    rerollBy: playerId ?? null,
    updatedAt: Date.now(),
  };
};

export const getWheelSettings = async () => {
  const wheelSettingsRef = doc(db, "game_settings", "wheel");
  const wheelSettingsSnap = await getDoc(wheelSettingsRef);
  return {
    wheelSettingsRef,
    wheelSettings: wheelSettingsSnap.data() as WheelSettings | undefined,
  };
};

export const validateWheelRerollAvailable = async (
  showWheel: boolean,
  notify: Notify,
  cardId?: string,
) => {
  if (!showWheel) {
    notify("Карту \"Подкрутка\" можно использовать только после первого результата колеса.", "warning", cardId);
    return false;
  }

  const { wheelSettings } = await getWheelSettings();
  if (wheelSettings?.isSpinning) {
    notify("Дождитесь остановки колеса.", "warning", cardId);
    return false;
  }

  if (typeof wheelSettings?.winnerIndex !== "number") {
    notify("Сначала нужно запустить колесо и получить результат.", "warning", cardId);
    return false;
  }

  return true;
};

export const validateWheelFishCancelAvailable = async (
  userId: string,
  notify: Notify,
  cardId: string,
) => {
  const { wheelSettings } = await getWheelSettings();
  const lastCard = wheelSettings?.wheelCardStack?.at(-1);

  if (wheelSettings?.isSpinning) {
    notify("Дождитесь остановки колеса.", "warning", cardId);
    return false;
  }

  if (typeof wheelSettings?.winnerIndex !== "number") {
    notify("Сначала нужно запустить колесо и получить результат.", "warning", cardId);
    return false;
  }

  if (!lastCard) {
    notify("No, no, no Mr.Fish отменяет только последнюю активную карту на колесе, а не само колесо.", "warning", cardId);
    return false;
  }

  return true;
};

export const rerollWheel = async ({
  userId,
  showWheel,
  source,
  notify,
  isAdmin = false,
}: {
  userId: string;
  showWheel: boolean;
  source: "participant_reroll" | "inv_017";
  notify: Notify;
  isAdmin?: boolean;
}) => {
  if (!showWheel) {
    notify("Колесо сейчас закрыто.", "warning");
    return false;
  }

  const cardId = "inv_017";
  const gamesSnap = await getDocs(collection(db, "wheel"));
  const activeGames = gamesSnap.docs
    .filter((gameDoc) => gameDoc.data().active === true)
    .sort((a, b) => a.id.localeCompare(b.id));

  if (activeGames.length === 0) {
    notify("В коллекции wheel нет активных игр для переброса.", "warning");
    return false;
  }

  try {
    const wheelSettingsRef = doc(db, "game_settings", "wheel");
    const playerRef = doc(db, "players", userId);
    const gameStateRef = doc(db, "gameState", "current");

    return await runTransaction(db, async (transaction) => {
      const [wheelSnap, playerSnap] = await Promise.all([
        transaction.get(wheelSettingsRef),
        transaction.get(playerRef)
      ]);

      const wheelSettings = wheelSnap.data() as WheelSettings | undefined;
      const playerData = playerSnap.data();
      const inventory = playerData?.inventory ?? [];

      // Проверка наличия карты (если не админ)
      if (!isAdmin && source === "inv_017" && !inventory.includes(cardId)) {
        notify("Этой карты больше нет в вашем инвентаре.", "error", cardId);
        return false;
      }

      if (wheelSettings?.isSpinning) {
        notify("Дождитесь остановки колеса.", "info");
        return false;
      }

      if (typeof wheelSettings?.winnerIndex !== "number") {
        notify("Сначала нужно запустить колесо и получить результат.", "warning");
        return false;
      }

      const spinPayload = buildWheelSpinPayload(
        activeGames.length,
        Number(wheelSettings?.targetRotation ?? 0),
        wheelSettings.winnerIndex,
        source,
        userId,
      );

      const wheelCardStack = [
        ...(wheelSettings?.wheelCardStack ?? []),
        {
          cardId: "inv_017" as const,
          playerId: userId,
          previousWinnerIndex: wheelSettings.winnerIndex,
          resultWinnerIndex: spinPayload.winnerIndex,
          timestamp: Date.now(),
        },
      ];

      // Атомарное обновление всех документов
      transaction.update(wheelSettingsRef, { ...spinPayload, wheelCardStack });
      
      if (source === "inv_017" && !isAdmin) {
        transaction.update(playerRef, {
          inventory: removeOneCardFromInventory(inventory, cardId)
        });
        transaction.update(gameStateRef, {
          revealedCards: arrayUnion(cardId)
        });
      }

      notify(
        source === "inv_017" ? "Колесо переброшено картой \"Подкрутка\"." : "Колесо переброшено.",
        "info",
        source === "inv_017" ? cardId : undefined,
      );
      return true;
    });
  } catch (error) {
    console.error("Reroll transaction failed:", error);
    return false;
  }
};

export const cancelLastWheelCardWithFish = async (
  userId: string,
  notify: Notify,
  cardId: string,
  isAdmin: boolean = false,
) => {
  try {
    const wheelSettingsRef = doc(db, "game_settings", "wheel");
    const playerRef = doc(db, "players", userId);
    const gameStateRef = doc(db, "gameState", "current");

    return await runTransaction(db, async (transaction) => {
      const [wheelSnap, playerSnap] = await Promise.all([
        transaction.get(wheelSettingsRef),
        transaction.get(playerRef)
      ]);

      const wheelSettings = wheelSnap.data() as WheelSettings | undefined;
      const playerData = playerSnap.data();
      const inventory = playerData?.inventory ?? [];

      if (!isAdmin && !inventory.includes(cardId)) {
        notify("Этой карты больше нет в вашем инвентаре.", "error", cardId);
        return false;
      }

      const wheelCardStack = wheelSettings?.wheelCardStack ?? [];
      const lastCard = wheelCardStack.at(-1);

      if (!lastCard || (!isAdmin && lastCard.playerId === userId)) {
        notify("Вы опоздали! Карта уже отменена или недоступна.", "warning", cardId);
        return false;
      }

      const fishEntry: WheelCardStackEntry = {
        cardId: "inv_006",
        playerId: userId,
        previousWinnerIndex: Number(wheelSettings?.winnerIndex ?? lastCard.resultWinnerIndex),
        resultWinnerIndex: lastCard.previousWinnerIndex,
        timestamp: Date.now(),
      };

      transaction.update(wheelSettingsRef, {
        isSpinning: false,
        winnerIndex: fishEntry.resultWinnerIndex,
        lastSpinSource: cardId,
        wheelCardStack: [...wheelCardStack, fishEntry],
        updatedAt: Date.now(),
      });

      if (!isAdmin) {
        transaction.update(playerRef, {
          inventory: removeOneCardFromInventory(inventory, cardId)
        });
        transaction.update(gameStateRef, {
          revealedCards: arrayUnion(cardId)
        });
      }

      notify("Вы отменили последнюю активную карту на колесе картой No, no, no Mr.Fish.", "info", cardId);
      return true;
    });
  } catch (error) {
    console.error("Fish cancel transaction failed:", error);
    return false;
  }
};
