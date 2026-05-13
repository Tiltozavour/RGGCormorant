import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase";
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

  if (lastCard.playerId === userId) {
    notify("No, no, no Mr.Fish нельзя использовать на свою же последнюю карту.", "warning", cardId);
    return false;
  }

  return true;
};

export const rerollWheel = async ({
  userId,
  showWheel,
  source,
  notify,
}: {
  userId: string;
  showWheel: boolean;
  source: "participant_reroll" | "inv_017";
  notify: Notify;
}) => {
  if (!showWheel) {
    notify("Колесо сейчас закрыто.", "warning");
    return;
  }

  const { wheelSettingsRef, wheelSettings } = await getWheelSettings();
  if (wheelSettings?.isSpinning) {
    notify("Дождитесь остановки колеса.", "info");
    return;
  }

  if (typeof wheelSettings?.winnerIndex !== "number") {
    notify("Сначала нужно запустить колесо и получить результат.", "warning");
    return;
  }

  const gamesSnap = await getDocs(collection(db, "wheel"));
  const activeGames = gamesSnap.docs
    .filter((gameDoc) => gameDoc.data().active === true)
    .sort((a, b) => a.id.localeCompare(b.id));

  if (activeGames.length === 0) {
    notify("В коллекции wheel нет активных игр для переброса.", "warning");
    return;
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

  await setDoc(
    wheelSettingsRef,
    {
      ...spinPayload,
      wheelCardStack,
    },
    { merge: true },
  );

  notify(
    source === "inv_017" ? "Колесо переброшено картой \"Подкрутка\"." : "Колесо переброшено.",
    "info",
    source === "inv_017" ? "inv_017" : undefined,
  );
};

export const cancelLastWheelCardWithFish = async (
  userId: string,
  notify: Notify,
  cardId: string,
) => {
  const { wheelSettingsRef, wheelSettings } = await getWheelSettings();
  const wheelCardStack = wheelSettings?.wheelCardStack ?? [];
  const lastCard = wheelCardStack.at(-1);

  if (!lastCard || lastCard.playerId === userId) {
    notify("No, no, no Mr.Fish отменяет только последнюю чужую активную карту на колесе.", "warning", cardId);
    return false;
  }

  const fishEntry: WheelCardStackEntry = {
    cardId: "inv_006",
    playerId: userId,
    previousWinnerIndex: Number(wheelSettings?.winnerIndex ?? lastCard.resultWinnerIndex),
    resultWinnerIndex: lastCard.previousWinnerIndex,
    timestamp: Date.now(),
  };

  await setDoc(
    wheelSettingsRef,
    {
      isSpinning: false,
      winnerIndex: fishEntry.resultWinnerIndex,
      lastSpinSource: "inv_006",
      wheelCardStack: [...wheelCardStack, fishEntry],
      updatedAt: Date.now(),
    },
    { merge: true },
  );
  notify("Вы отменили последнюю активную карту на колесе картой No, no, no Mr.Fish.", "info", cardId);
  return true;
};
