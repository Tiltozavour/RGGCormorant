/* eslint-disable react-hooks/purity, @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback, useRef } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import {
  collection,
  deleteField,
  doc,
  getDocs,
  getDoc,
  onSnapshot,
  updateDoc,
  setDoc,
  arrayUnion,
  increment,
  arrayRemove,
  runTransaction,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { auth, db } from "../firebase"; // Assuming db is imported
import { resetStarterCards } from "../types/cardService";
import { gameMap } from "./gameMap";
import type { CardRarity, GameCard, DuelWeapon } from "../types/card";
import { defaultGameState } from "../types/game";
import type { DuelState, GameState, Player } from "../types/game";
import { PHASE_ORDER } from "./gameConstants";

const rollD6 = () => Math.floor(Math.random() * 6) + 1;
import type { GameEvent, ToastNotification } from "./useModalStates"; // Import new types

const pickRandom = <T,>(items: T[]): T | null => {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
};

const pickWeighted = <T,>(items: T[], getWeight: (item: T) => number): T | null => {
  const weightedItems = items
    .map((item) => ({ item, weight: Math.max(0, getWeight(item)) }))
    .filter(({ weight }) => weight > 0);

  const totalWeight = weightedItems.reduce((sum, { weight }) => sum + weight, 0);
  if (totalWeight <= 0) return null;

  let roll = Math.random() * totalWeight;
  for (const { item, weight } of weightedItems) {
    roll -= weight;
    if (roll <= 0) return item;
  }

  return weightedItems[weightedItems.length - 1]?.item ?? null;
};

const shuffle = <T,>(array: T[]): T[] => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
};

type WheelCardStackEntry = {
  cardId: "inv_017" | "inv_006";
  playerId: string;
  previousWinnerIndex: number;
  resultWinnerIndex: number;
  timestamp: number;
};

type WheelSettings = {
  isSpinning?: boolean;
  targetRotation?: number;
  winnerIndex?: number | null;
  previousWinnerIndex?: number | null;
  previousTargetRotation?: number | null;
  wheelCardStack?: WheelCardStackEntry[];
  lastSpinSource?: string;
};

const buildWheelSpinPayload = (
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

const clearTemporaryStatus = {
  customStatus: null,
  statusDuration: 0,
};

const addOneCardToInventory = (inventory: string[] | undefined, cardId: string) => [
  ...(inventory ?? []),
  cardId,
];

const removeOneCardFromInventory = (inventory: string[] | undefined, cardId: string) => {
  const nextInventory = [...(inventory ?? [])];
  const cardIndex = nextInventory.indexOf(cardId);
  if (cardIndex >= 0) nextInventory.splice(cardIndex, 1);
  return nextInventory;
};

/**
 * Проверяет, находится ли игрок в пределах одной клетки (соседняя или та же).
 * @param player1Id ID первого игрока.
 * @param player2Id ID второго игрока.
 * @param allPlayers Список всех активных игроков.
 * @param map Текущая карта игрового поля.
 * @returns true, если игроки находятся рядом, иначе false.
 */
const isPlayerNearby = (
  player1Id: string,
  player2Id: string,
  allPlayers: Player[],
  map: typeof gameMap
): boolean => {
  const player1 = allPlayers.find(p => p.id === player1Id);
  const player2 = allPlayers.find(p => p.id === player2Id);

  if (!player1 || !player2 || player1.position === undefined || player2.position === undefined) {
    return false;
  }

  const pos1 = player1.position;
  const pos2 = player2.position;

  const cell1 = map.find(c => c.id === pos1);
  const cell2 = map.find(c => c.id === pos2);

  if (!cell1 || !cell2) return false;

  return pos1 === pos2 || cell1.next.includes(pos2) || cell2.next.includes(pos1);
};

type GamblingRarity = Exclude<CardRarity, "legendary">;

const GAMBLING_RARITY_WEIGHTS: Array<{ rarity: GamblingRarity; weight: number }> = [
  { rarity: "common", weight: 50 },
  { rarity: "rare", weight: 30 },
  { rarity: "epic", weight: 20 },
];

const GAMBLING_MOMENTAL_WEIGHT = 3;

export function useGameData(
  notify: (message: string, type?: ToastNotification['type'], cardId?: string) => void,
  logEvent: (event: GameEvent) => void
) {
  const [user, setUser] = useState<User | null>(null);
  const [playerData, setPlayerData] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState>(defaultGameState);
  const [allCards, setAllCards] = useState<Record<string, GameCard>>({});
  const [syncedEvents, setSyncedEvents] = useState<GameEvent[]>([]);
  const lastAppliedCardMoveRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "players", user.uid), (snap) => {
      if (snap.exists()) {
        setPlayerData({ id: snap.id, ...(snap.data() as Omit<Player, "id">) });
      }
      setLoading(false);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "gameEvents"), orderBy("timestamp", "desc"), limit(100));
    return onSnapshot(q, (snap) => {
      setSyncedEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as GameEvent)));
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, "players"), (snap) => {
      setPlayers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Player, "id">) })));
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "gameState", "current"), (snap) => {
      if (snap.exists()) {
        setGameState({ ...defaultGameState, ...snap.data() } as GameState);
      }
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const cardMove = gameState.cardMove;
    if (
      !cardMove ||
      cardMove.targetId !== user.uid ||
      typeof cardMove.position !== "number"
    ) {
      return;
    }

    const key = `${cardMove.id}:${cardMove.position}:${cardMove.prevCell ?? "null"}`;
    if (lastAppliedCardMoveRef.current === key) return;
    lastAppliedCardMoveRef.current = key;

    void updateDoc(doc(db, "players", user.uid), {
      position: cardMove.position,
      prevCell: cardMove.prevCell ?? null,
    });
  }, [gameState.cardMove, user]);

  useEffect(() => {
    if (!user) return;
    const unsubCards = onSnapshot(collection(db, "cards"), (snap) => {
      const cards: Record<string, GameCard> = {};
      snap.docs.forEach((d) => {
        cards[d.id] = { id: d.id, ...d.data() } as GameCard;
      });
      setAllCards((prev) => ({ ...prev, ...cards }));
    });

    const unsubPrizes = onSnapshot(collection(db, "prizes"), (snap) => {
      const prizes: Record<string, GameCard> = {};
      snap.docs.forEach((d) => {
        prizes[d.id] = { id: d.id, ...d.data() } as GameCard;
      });
      setAllCards((prev) => ({ ...prev, ...prizes }));
    });

    return () => {
      unsubCards();
      unsubPrizes();
    };
  }, [user]);

  const isAdmin = playerData?.role === "admin";
  const currentTurnPlayerId = gameState.turnOrder[gameState.currentTurnIndex] ?? null;
  const isTurnPhase = gameState.phase === "turn";
  const isCurrentPlayersTurn = currentTurnPlayerId === user?.uid;

  const canRoll =
    !isAdmin &&
    !!playerData?.inGame &&
    isTurnPhase &&
    isCurrentPlayersTurn &&
    gameState.currentRoll === null;

  const canConfirmRoll =
    !isAdmin &&
    !!playerData?.inGame &&
    (isCurrentPlayersTurn || gameState.currentRollPlayerId === user?.uid) &&
    gameState.currentRoll !== null &&
    !gameState.rollConfirmed;

  // Текст восстановлен после сбоя кодировки.
  useEffect(() => {
    // Текст восстановлен после сбоя кодировки.
    if (!isAdmin || !gameState.activeDuels) return;

    const finishedDuelIds = Object.keys(gameState.activeDuels).filter(
      (id) => gameState.activeDuels[id].status === "finished"
    );

    if (finishedDuelIds.length === 0) return;

    // Текст восстановлен после сбоя кодировки.
    const timer = setTimeout(async () => {
      const gsRef = doc(db, "gameState", "current");
      const updates: Record<string, any> = {};
      
      finishedDuelIds.forEach((id) => {
        updates[`activeDuels.${id}`] = deleteField();
      });

      await updateDoc(gsRef, updates);
    }, 15000);

    return () => clearTimeout(timer);
  }, [gameState.activeDuels, isAdmin]);

  // Текст восстановлен после сбоя кодировки.
  const applyMomentalCardEffect = useCallback(
    async (
      player: Player,
      momentalCard: GameCard,
      transaction: any, // Firestore transaction
      fromCardMove: boolean = false,
    ): Promise<boolean> => {
      if (!momentalCard || momentalCard.deck !== "momental") {
        console.error("Ошибка действия.");
        return false;
      }

      const playerDocRef = doc(db, "players", player.id);
      const gameStateRef = doc(db, "gameState", "current");

      let actualValue = momentalCard.value;
      let promoCodeUsed = false;
      let openedSpecialInteraction = false;
      const getInteractionCards = (type: "gambling" | "bshop") => {
        const cardsArray = Object.values(allCards).filter((card): card is GameCard => Boolean(card?.id && card.deck && card.rarity));
        if (cardsArray.length === 0) return [];
        const result: string[] = [];

        for (let i = 0; i < 3; i += 1) {
          if (type === "bshop") {
            const pool = cardsArray.filter((card) => card.deck === "inventory" && typeof card.price === 'number');
            const selected = pickRandom(pool);
            if (selected) result.push(selected.id);
          } else {
            const rarity = pickWeighted(
              GAMBLING_RARITY_WEIGHTS.filter(({ rarity }) =>
                cardsArray.some((card) => card.rarity === rarity),
              ),
              ({ weight }) => weight,
            )?.rarity;

            const pool = rarity
              ? cardsArray.filter((card) => card.rarity === rarity)
              : cardsArray.filter((card) => card.rarity !== "legendary");
            const selected = pickWeighted(
              pool,
              (card) => (card.deck === "momental" ? GAMBLING_MOMENTAL_WEIGHT : 1),
            );
            if (selected) result.push(selected.id);
          }
        }

        return result;
      };

      const openSpecialInteractionIfNeeded = (position: number) => {
        const finalCell = gameMap.find((cell) => cell.id === position);
        const cellType = finalCell?.type === "b-shop" ? "bshop" : finalCell?.type;
        if (cellType !== "gambling" && cellType !== "bshop") return;

        openedSpecialInteraction = true;
        transaction.update(gameStateRef, {
          activeInteraction: {
            playerId: player.id,
            type: cellType,
            cards: getInteractionCards(cellType),
            fromCardMove,
          },
        });
      };

      // Текст восстановлен после сбоя кодировки.
      if (
        (momentalCard.action === "add_coins" && momentalCard.value < 0) ||
        (momentalCard.action === "move_steps" && momentalCard.value < 0) ||
        momentalCard.action === "skip_turn" ||
        (momentalCard.action === "teleport" && momentalCard.value === 0)
      ) {
        if (player.customStatus === "promo_code_active") {
          actualValue = Math.ceil(momentalCard.value / 2);
          promoCodeUsed = true;
          transaction.update(playerDocRef, clearTemporaryStatus);
          notify("Событие игры обновлено.", 'success');
          logEvent({
            id: `promo_code_used_momental_${momentalCard.id}_${Date.now()}`,
            timestamp: Date.now(), type: 'status_effect',
            message: "Событие игры.",
            playerId: player.id, cardId: momentalCard.id,
            details: { originalAmount: momentalCard.value, finalAmount: actualValue }
          });
        }
      }

      // Текст восстановлен после сбоя кодировки.
      if (momentalCard.action === "add_coins") {
        const cardName = momentalCard.id === "mom_001" ? "Налоговая инспекция" : momentalCard.name;
        const coinText = actualValue > 0 ? "получил" : "потерял";
        const amount = Math.abs(actualValue);
        const message = `${player.login} ${coinText} ${amount} монет по карте "${cardName}".`;

        transaction.update(playerDocRef, {
          tiltCoins: increment(actualValue),
          lastNotification: {
            message,
            timestamp: Date.now(),
            cardId: momentalCard.id,
          },
        });
        notify(promoCodeUsed ? `${message} Промокодик смягчил эффект.` : message, actualValue > 0 ? 'success' : 'error', momentalCard.id);
        logEvent({
          id: `momental_coin_change_${momentalCard.id}_${Date.now()}`,
          timestamp: Date.now(), type: 'coin_change',
          message,
          playerId: player.id, targetPlayerId: undefined, cardId: momentalCard.id, details: { amount: actualValue, reason: 'momental_card_effect', cardName, promoCodeUsed }
        });
      } else if (momentalCard.action === "move_steps") {
        const currentPos = player.position || 0;
        const finalPosition = Math.max(0, currentPos + actualValue);
        transaction.update(playerDocRef, {
          position: finalPosition,
          prevCell: null,
        });
        openSpecialInteractionIfNeeded(finalPosition);
        notify(`${player.login} переместился на ${actualValue} клеток по карте "${momentalCard.name}".`, 'info', momentalCard.id);
        logEvent({
          id: `momental_move_${momentalCard.id}_${Date.now()}`,
          timestamp: Date.now(), type: 'movement',
          message: `${player.login} переместился на ${actualValue} клеток по моментальной карте "${momentalCard.name}".`,
          playerId: player.id, targetPlayerId: undefined, cardId: momentalCard.id, details: { steps: actualValue, reason: 'momental_card_effect', cardName: momentalCard.name }
        });
      } else if (momentalCard.action === "teleport") {
        transaction.update(playerDocRef, { position: actualValue, prevCell: null });
        openSpecialInteractionIfNeeded(actualValue);
        notify(`${player.login} телепортировался на клетку ${actualValue} по карте "${momentalCard.name}".`, 'info', momentalCard.id);
        logEvent({
          id: `momental_teleport_${momentalCard.id}_${Date.now()}`,
          timestamp: Date.now(), type: 'movement',
          message: `${player.login} телепортировался на клетку ${actualValue} по моментальной карте "${momentalCard.name}".`,
          playerId: player.id, targetPlayerId: undefined, cardId: momentalCard.id, details: { targetPosition: actualValue, reason: 'momental_card_effect', cardName: momentalCard.name }
        });
      }
      // Добавляем карту в список раскрытых
      transaction.update(gameStateRef, { revealedCards: arrayUnion(momentalCard.id) });
      return openedSpecialInteraction;
    },
    [allCards, notify, logEvent]
  );

  const getPlayerById = useCallback(
    (playerId?: string | null) => players.find((player) => player.id === playerId) ?? null,
    [players],
  );

  const getNextPlayerId = useCallback(
    (playerId: string) => {
      const activeTurnOrder = gameState.turnOrder.filter((id) => id !== playerId);
      if (gameState.turnOrder.length > 1) {
        const currentIndex = gameState.turnOrder.indexOf(playerId);
        if (currentIndex !== -1) {
          for (let offset = 1; offset < gameState.turnOrder.length; offset += 1) {
            const candidateId =
              gameState.turnOrder[(currentIndex + offset) % gameState.turnOrder.length];
            if (candidateId !== playerId) return candidateId;
          }
        }
      }

      if (activeTurnOrder.length > 0) return activeTurnOrder[0];

      return (
        players.find((player) => player.id !== playerId && player.inGame && player.role !== "admin")?.id ??
        null
      );
    },
    [gameState.turnOrder, players],
  );

  const handleLogout = () => signOut(auth);

  const handleUpdateLogin = async (val: string) => {
    if (!user || !playerData || val === playerData.login || val.trim().length < 3) return;
    await updateDoc(doc(db, "players", user.uid), { login: val.trim() });
  };
  const handleUpdateBorderColor = async (color: string) => {
    if (!user) return;
    await updateDoc(doc(db, "players", user.uid), { borderColor: color });
  };

  const chooseStart = async (cellId: number) => {
    if (!user) return;
    await setDoc(doc(db, "players", user.uid), {
      position: cellId,
      prevCell: null,
      inGame: true,
      inventory: ["inv_006", "inv_007"],
    }, { merge: true });
  };

  const updateAvatar = async (url: string) => {
    if (!user) return;
    await updateDoc(doc(db, "players", user.uid), { avatar: url });
  };

  const grantPrizeCard = async (playerId: string, cardId: string) => {
    if (!isAdmin) return;
    const playerRef = doc(db, "players", playerId);
    const prizeRef = doc(db, "prizes", cardId);

    try {
      await runTransaction(db, async (transaction) => {
        const prizeSnap = await transaction.get(prizeRef);
        const playerSnap = await transaction.get(playerRef);
        if (!prizeSnap.exists()) return;

        const prizeData = prizeSnap.data() as GameCard;
        if (prizeData.isUnique && prizeData.isWon) return;

        transaction.update(playerRef, {
          inventory: addOneCardToInventory((playerSnap.data() as Player | undefined)?.inventory, cardId),
        });
        transaction.update(prizeRef, { isWon: true, winnerId: playerId });
      });
    } catch (e) {
      console.error("Ошибка при выдаче легендарной карты:", e);
    }
  };

  const handleRerollWheel = async (source: "participant_reroll" | "inv_017" = "participant_reroll") => {
    if (!user || !playerData) return;
    if (!gameState.showWheel) {
      notify("Колесо сейчас закрыто.", "warning");
      return;
    }

    const wheelSettingsRef = doc(db, "game_settings", "wheel");
    const wheelSettingsSnap = await getDoc(wheelSettingsRef);
    const wheelSettings = wheelSettingsSnap.data() as WheelSettings | undefined;

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
      user.uid,
    );
    const wheelCardStack = [
      ...(wheelSettings?.wheelCardStack ?? []),
      {
        cardId: "inv_017" as const,
        playerId: user.uid,
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

    notify(source === "inv_017" ? "Колесо переброшено картой \"Подкрутка\"." : "Колесо переброшено.", "info", source === "inv_017" ? "inv_017" : undefined);
  };

  const handleUseCard = async (card: GameCard, targetPlayerId: string | null = null) => {
    if (!user || !playerData) return;

    if (!isAdmin) {
      const { phase, currentRoll } = gameState;

      if (phase === "next_game") {
        if (card.action !== "spin_wheel" && !(card.action === "fish_protection" && gameState.showWheel)) {
          notify("В этой фазе можно использовать только карту 'Подкрутка'!", 'warning');
          return;
        }
      } else if (phase === "turn") {
        const isProtection = card.action === "protection";
        const isFish = card.action === "fish_protection";
        const isReflect = card.action === "reflect_debuff";
        const isExtraRoll = card.action === "extra_roll";
        const isMovement = card.action === "move_steps";
        const isCommunism = card.action === "communism";
        const isPromoCode = card.action === "promo_code_benefit";

        if (!isProtection && !isFish && !isReflect && !isCommunism && !isPromoCode) {
          if (!isCurrentPlayersTurn) {
            notify("Сейчас не ваш ход!", 'warning');
            return;
          }

          if (card.id === "inv_005" && currentRoll !== null) {
            notify("Карту \"Квантовый прыжок\" можно использовать только до броска кубика.", 'warning', card.id);
            return;
          }

          if (!isMovement && !isExtraRoll && currentRoll !== null) {
            notify("Кубик уже брошен. Обычные карты используются ДО броска.", 'warning');
            return;
          }
        }

        if (isExtraRoll && currentRoll === null) {
          notify("Сначала бросьте кубик!", 'warning');
          return;
        }
      } else {
        if (card.action !== "fish_protection") {
          notify("Использование карт в этой фазе запрещено.", 'warning');
          return;
        }
      }
    }

    if (card.action === "protection" && playerData.hasProtection) {
      notify("У вас уже активно Силовое поле!", 'info');
      return;
    }

    if (card.action === "passive_benefit") {
      notify("Эта карта работает автоматически и не тратится при нажатии.", 'info');
      return;
    }

    const targetRef = targetPlayerId ? doc(db, "players", targetPlayerId) : null;
    const targetPlayer = getPlayerById(targetPlayerId);
    const displayCardName = card.id === "inv_016" ? "Катжит не виноват!" : card.name;

    // Текст восстановлен после сбоя кодировки.
    // Текст восстановлен после сбоя кодировки.
    if (card.id === "inv_016" && card.action === "steal_coins") {
      if (!targetPlayerId || !targetPlayer) {
        notify(`Выберите игрока рядом, у которого хотите украсть монеты картой "${displayCardName}".`, 'warning', card.id);
        logEvent({
          id: `card_use_fail_${card.id}_${Date.now()}`,
          timestamp: Date.now(),
          type: 'error',
          message: `${playerData.login} не выбрал цель для карты "${displayCardName}".`,
          cardId: card.id,
          playerId: user.uid
        });
        return;
      }

      const currentPlayerPosition = playerData.position;
      const targetPlayerPosition = targetPlayer.position;
      if (currentPlayerPosition === undefined || targetPlayerPosition === undefined) {
        notify(`Не удалось проверить расстояние до ${targetPlayer.login}. Попробуйте еще раз.`, 'error', card.id);
        logEvent({
          id: `card_use_fail_${card.id}_${Date.now()}`,
          timestamp: Date.now(),
          type: 'error',
          message: `Не удалось проверить расстояние для карты "${displayCardName}".`,
          cardId: card.id,
          playerId: user.uid
        });
        return;
      }

      if (!isPlayerNearby(user.uid, targetPlayerId, players, gameMap)) {
        notify(`Карта "${displayCardName}" работает только рядом с целью. ${targetPlayer.login} слишком далеко.`, 'warning', card.id);
        logEvent({
          id: `card_use_fail_${card.id}_${Date.now()}`,
          timestamp: Date.now(),
          type: 'warning',
          message: `${playerData.login} не смог использовать "${displayCardName}": цель слишком далеко.`,
          cardId: card.id,
          playerId: user.uid,
          targetPlayerId
        });
        return;
      }
    }
    // Текст восстановлен после сбоя кодировки.

    const playerRef = doc(db, "players", user.uid);

    if (card.action === "spin_wheel") {
      if (!gameState.showWheel) {
        notify("Карту \"Подкрутка\" можно использовать только после первого результата колеса.", "warning", card.id);
        return;
      }

      const wheelSettingsSnap = await getDoc(doc(db, "game_settings", "wheel"));
      const wheelSettings = wheelSettingsSnap.data() as WheelSettings | undefined;
      if (wheelSettings?.isSpinning) {
        notify("Дождитесь остановки колеса.", "warning", card.id);
        return;
      }

      if (typeof wheelSettings?.winnerIndex !== "number") {
        notify("Сначала нужно запустить колесо и получить результат.", "warning", card.id);
        return;
      }
    }

    if (card.action === "fish_protection" && gameState.showWheel) {
      const wheelSettingsSnap = await getDoc(doc(db, "game_settings", "wheel"));
      const wheelSettings = wheelSettingsSnap.data() as WheelSettings | undefined;
      const lastCard = wheelSettings?.wheelCardStack?.at(-1);

      if (wheelSettings?.isSpinning) {
        notify("Дождитесь остановки колеса.", "warning", card.id);
        return;
      }

      if (typeof wheelSettings?.winnerIndex !== "number") {
        notify("Сначала нужно запустить колесо и получить результат.", "warning", card.id);
        return;
      }

      if (!lastCard) {
        notify("No, no, no Mr.Fish отменяет только последнюю активную карту на колесе, а не само колесо.", "warning", card.id);
        return;
      }

      if (lastCard.playerId === user.uid) {
        notify("No, no, no Mr.Fish нельзя использовать на свою же последнюю карту.", "warning", card.id);
        return;
      }
    }

    try {
      const targetHasReflect = targetPlayer?.customStatus === "reflect_debuff";
      const targetHasFish = targetPlayer?.customStatus === "fish_shield";
      const targetHasPromoCode = targetPlayer?.customStatus === "promo_code_active";

      // Log card usage before removing from inventory
      logEvent({
        id: `card_play_${card.id}_${Date.now()}`,
        timestamp: Date.now(),
        type: 'card_play',
        message: "Событие игры.",
        cardId: card.id,
        playerId: user.uid,
        targetPlayerId: targetPlayerId ?? undefined
      });

      await updateDoc(playerRef, { inventory: removeOneCardFromInventory(playerData.inventory, card.id) });
      await updateDoc(doc(db, "gameState", "current"), { revealedCards: arrayUnion(card.id) });

      switch (card.action) {
        case "extra_roll": {
          const activeBonus = (gameState.currentRoll ?? 0) - (gameState.lastBaseRoll ?? 0);
          await updateDoc(doc(db, "gameState", "current"), {
            currentRoll: null,
            rollConfirmed: false,
            lastBaseRoll: null,
            rollBonus: activeBonus,
          });
          notify("Событие игры обновлено.", 'info');
          logEvent({
            id: `extra_roll_activated_${Date.now()}`,
            timestamp: Date.now(),
            type: 'status_effect',
            message: "Событие игры.",
            playerId: user.uid,
            cardId: card.id
          });
          break;
        }

        case "add_coins":
          await updateDoc(playerRef, { tiltCoins: increment(card.value) });
          notify("Событие игры обновлено.", 'success');
          logEvent({
            id: `coin_gain_${card.id}_${Date.now()}`,
            timestamp: Date.now(),
            type: 'coin_change',
            message: "\u0421\u043e\u0431\u044b\u0442\u0438\u0435 \u0438\u0433\u0440\u044b.",
            playerId: user.uid, cardId: card.id, details: { amount: card.value, reason: 'card_effect' }
          });
          break;

        case "steal_coins":
          if (targetRef && targetPlayerId) {
            if (!targetPlayer) {
              notify("Target player not found.", 'error');
              break;
            }
            if (card.id === "inv_016") {
              const roll = rollD6();
              const timestamp = Date.now();

              if (roll >= 4) {
                let victimLoss = card.value;
                let promoCodeMessage = "";

                if (targetHasPromoCode) {
                  victimLoss = 2;
                  promoCodeMessage = " Промокодик цели снизил сумму до 2 монет.";
                  logEvent({
                    id: `promo_code_used_katjit_${card.id}_${timestamp}`,
                    timestamp,
                    type: 'status_effect',
                    message: `${targetPlayer.login} использовал Промокодик против карты "${displayCardName}".`,
                    playerId: targetPlayer.id,
                    cardId: card.id,
                    details: { originalSteal: card.value, actualSteal: victimLoss }
                  });
                }

                const actualVictimLoss = victimLoss;
                await runTransaction(db, async (transaction) => {
                  transaction.update(targetRef, {
                    tiltCoins: increment(-actualVictimLoss),
                    lastNotification: {
                      message: `${playerData.login} украл у вас ${actualVictimLoss} монет картой "${displayCardName}" (бросок ${roll}).${promoCodeMessage}`,
                      timestamp,
                      cardId: card.id,
                    },
                    ...(targetHasPromoCode ? clearTemporaryStatus : {}),
                  });
                  transaction.update(playerRef, { tiltCoins: increment(actualVictimLoss) });
                });

                const resultMessage = actualVictimLoss > 0
                  ? `Катжит: бросок ${roll}. Успех! Вы украли ${actualVictimLoss} монет у ${targetPlayer.login}.${promoCodeMessage}`
                  : `Катжит: бросок ${roll}. Успех, но у ${targetPlayer.login} нет монет, украсть нечего.${promoCodeMessage}`;
                notify(resultMessage, actualVictimLoss > 0 ? 'success' : 'info', card.id);
                logEvent({
                  id: `katjit_success_${card.id}_${timestamp}`,
                  timestamp,
                  type: 'coin_change',
                  message: `${playerData.login} успешно использовал "${displayCardName}" против ${targetPlayer.login}: бросок ${roll}, украдено ${actualVictimLoss} монет.`,
                  playerId: user.uid,
                  targetPlayerId: targetPlayer.id,
                  cardId: card.id,
                  details: { roll, success: true, amount: actualVictimLoss, promoCodeReduced: targetHasPromoCode }
                });
              } else {
                await updateDoc(playerRef, { tiltCoins: increment(-card.value) });
                notify(`Катжит: бросок ${roll}. Провал! Вас заметили, вы теряете ${card.value} монет.`, 'error', card.id);
                logEvent({
                  id: `katjit_fail_${card.id}_${timestamp}`,
                  timestamp,
                  type: 'coin_change',
                  message: `${playerData.login} провалил "${displayCardName}" против ${targetPlayer.login}: бросок ${roll}, штраф ${card.value} монет.`,
                  playerId: user.uid,
                  targetPlayerId: targetPlayer.id,
                  cardId: card.id,
                  details: { roll, success: false, penalty: card.value }
                });
              }
            } else {
              await runTransaction(db, async (transaction) => {
                const targetSnap = await transaction.get(targetRef);
                const currentTargetCoins = targetSnap.data()?.tiltCoins || 0;
                const stealAmount = Math.min(Math.max(0, currentTargetCoins), card.value);
                transaction.update(targetRef, { tiltCoins: increment(-stealAmount) });
                transaction.update(playerRef, { tiltCoins: increment(stealAmount) });
              });
              notify("Событие игры обновлено.", 'success');
              logEvent({
                id: `steal_other_card_${card.id}_${Date.now()}`,
                timestamp: Date.now(), type: 'coin_change',
                message: "Событие игры.",
                playerId: user.uid, targetPlayerId: targetPlayer.id, cardId: card.id,
                details: { amount: card.value, cardName: card.name }
              });
            }
          }
          break;

        case "move_steps": {
          const targetId = targetPlayerId || user.uid;
          const isForward = card.value > 0;
          const isHostile = targetId !== user.uid;

          if (isForward && gameState.phase === "turn") {
            if (card.id === "inv_007" && isHostile) {
              if (targetHasFish) {
                await updateDoc(targetRef!, clearTemporaryStatus);
                notify(`${targetPlayer?.login} защитился картой "No, no, no Mr.Fish".`, 'warning', card.id);
                logEvent({
                  id: `move_blocked_${card.id}_${Date.now()}`,
                  timestamp: Date.now(),
                  type: 'status_effect',
                  message: `${targetPlayer?.login} заблокировал карту "${card.name}".`,
                  playerId: targetPlayer?.id,
                  targetPlayerId: user.uid,
                  cardId: card.id,
                  details: { protectionCard: 'inv_006' }
                });
                break;
              }

              const timestamp = Date.now();
              await updateDoc(doc(db, "gameState", "current"), {
                cardMove: {
                  id: `${card.id}_${timestamp}`,
                  controllerId: user.uid,
                  controllerName: playerData.login,
                  targetId,
                  steps: card.value,
                  cardId: card.id,
                  cardName: card.name,
                },
                forcedMovePlayerId: null,
                currentRoll: null,
                currentRollPlayerId: null,
                rollConfirmed: false,
              });
              notify(`Вы управляете фишкой игрока ${targetPlayer?.login} на ${card.value} клетки.`, 'info', card.id);
              logEvent({
                id: `card_move_start_${card.id}_${timestamp}`,
                timestamp,
                type: 'movement',
                message: `${playerData.login} управляет фишкой ${targetPlayer?.login} по карте "${card.name}".`,
                playerId: user.uid,
                targetPlayerId: targetId,
                cardId: card.id,
                details: { steps: card.value }
              });
              break;
            }

            const isMyRollActive = gameState.currentRoll !== null && gameState.currentRollPlayerId === user.uid;
            if (isMyRollActive) {
              await updateDoc(doc(db, "gameState", "current"), {
                currentRoll: increment(card.value),
                currentRollPlayerId: targetId,
                rollConfirmed: false,
              });
              notify(`Ваш текущий ход увеличен на ${card.value} (итого: ${(gameState.currentRoll || 0) + card.value}).`, 'info', card.id);
            } else {
              await updateDoc(doc(db, "gameState", "current"), {
                rollBonus: increment(card.value),
              });
              notify(`Следующий бросок получит бонус +${card.value}.`, 'info', card.id);
            }
          } else {
            const subjectRef = targetRef || playerRef;
            const subjectPlayer = targetPlayerId ? getPlayerById(targetPlayerId) : playerData;
            const currentPos = subjectPlayer?.position || 0;
            await updateDoc(subjectRef, {
              position: Math.max(0, currentPos + card.value),
              prevCell: null,
            });
            notify(`${subjectPlayer?.login || playerData.login} переместился на ${card.value} клеток по карте "${card.name}".`, 'info', card.id);
            logEvent({
              id: `player_moved_${card.id}_${Date.now()}`,
              timestamp: Date.now(),
              type: 'movement',
              message: `${subjectPlayer?.login || playerData.login} переместился на ${card.value} клеток по карте "${card.name}".`,
              playerId: targetPlayerId || user.uid,
              cardId: card.id,
              details: { steps: card.value, reason: 'card_effect' }
            });
          }
          break;
        }

        case "teleport":
          await updateDoc(playerRef, { position: card.value, prevCell: null });
          notify(`Вы телепортировались на клетку ${card.value}.`, 'info', card.id);
          logEvent({
            id: `teleport_${card.id}_${Date.now()}`,
            timestamp: Date.now(),
            type: 'movement',
            message: `${playerData.login} телепортировался на клетку ${card.value}.`,
            playerId: user.uid,
            cardId: card.id,
            details: { targetPosition: card.value, reason: 'card_effect' }
          });
          break;

        case "teleport_to_type": {
          const currentPos = playerData.position ?? 0;
          const bshops = gameMap.filter((cell) => cell.type === "b-shop").map((cell) => cell.id).sort((a, b) => a - b);
          const targetPosition = bshops.find((id) => id > currentPos) ?? bshops[0];

          if (targetPosition === undefined) {
            notify("На карте не найден B-Shop.", 'warning', card.id);
            break;
          }

          await updateDoc(playerRef, { position: targetPosition, prevCell: null });
          notify(`Вы телепортировались в B-Shop на клетку ${targetPosition}.`, 'info', card.id);
          logEvent({
            id: `teleport_to_bshop_${card.id}_${Date.now()}`,
            timestamp: Date.now(),
            type: 'movement',
            message: `${playerData.login} телепортировался в B-Shop на клетку ${targetPosition}.`,
            playerId: user.uid,
            cardId: card.id,
            details: { targetPosition, reason: 'card_effect' }
          });
          break;
        }

        case "spin_wheel":
          if (gameState.showWheel) {
            await handleRerollWheel("inv_017");
          } else {
            await updateDoc(doc(db, "gameState", "current"), { showWheel: true });
            notify("Колесо открыто. Дождитесь результата, чтобы использовать переброс.", "info", card.id);
          }
          break;

        case "protection":
          await updateDoc(playerRef, { hasProtection: true });
          notify("Силовое поле активно.", 'info', card.id);
          break;
        
        case "fish_protection":
          if (gameState.showWheel) {
            const wheelSettingsRef = doc(db, "game_settings", "wheel");
            const wheelSettingsSnap = await getDoc(wheelSettingsRef);
            const wheelSettings = wheelSettingsSnap.data() as WheelSettings | undefined;
            const wheelCardStack = wheelSettings?.wheelCardStack ?? [];
            const lastCard = wheelCardStack.at(-1);

            if (!lastCard || lastCard.playerId === user.uid) {
              notify("No, no, no Mr.Fish отменяет только последнюю чужую активную карту на колесе.", 'warning', card.id);
              break;
            }

            const fishEntry: WheelCardStackEntry = {
              cardId: "inv_006",
              playerId: user.uid,
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
            notify("Вы отменили последнюю активную карту на колесе картой No, no, no Mr.Fish.", 'info', card.id);
          } else {
            await updateDoc(playerRef, {
              customStatus: "fish_shield",
              statusDuration: 1,
            });
            notify("Защита No, no, no Mr.Fish активна.", 'info', card.id);
          }
          break;

        case "prize":
          notify("Легендарная карта активирована.", 'success', card.id);
          break;

        case "judge_coins":
          if (targetPlayerId && targetRef) {
            const isHostile = targetPlayerId !== user.uid;
            if (isHostile && targetHasFish) {
              await updateDoc(targetRef, clearTemporaryStatus);
              notify(`${targetPlayer?.login} защитился картой "No, no, no Mr.Fish".`, 'warning', card.id);
              logEvent({
                id: `judge_blocked_${card.id}_${Date.now()}`,
                timestamp: Date.now(),
                type: 'status_effect',
                message: `${targetPlayer?.login} заблокировал карту "Судья душ".`,
                playerId: targetPlayerId,
                targetPlayerId: user.uid,
                cardId: card.id
              });
              break;
            }

            const targetDoc = (isHostile && targetHasReflect) ? playerRef : targetRef;
            const affectedPlayerId = (isHostile && targetHasReflect) ? user.uid : targetPlayerId;
            const affectedPlayerName = (isHostile && targetHasReflect) ? playerData.login : (targetPlayer?.login || "игрок");
            const originalTargetName = targetPlayer?.login || "игрок";
            
            if (isHostile && targetHasReflect) {
              await updateDoc(targetRef, clearTemporaryStatus);
              notify(`${originalTargetName} отразил карту "Судья душ". Эффект вернулся к вам.`, 'warning', card.id);
            }

            const roll = rollD6();
            const delta = roll >= 4 ? (card.value || 2) : -(card.value || 2);
            const amount = Math.abs(delta);
            const resultText = delta >= 0 ? `получает ${amount} монет` : `теряет ${amount} монет`;
            const resultMsg = `Судья душ: бросок ${roll}. ${affectedPlayerName} ${resultText}.`;
            
            await updateDoc(targetDoc, { tiltCoins: increment(delta) });
            if (affectedPlayerId !== user.uid) {
              await updateDoc(doc(db, "gameState", "current"), {
                [`notifications.${affectedPlayerId}`]: {
                  message: `${playerData.login} использовал карту "Судья душ" против вас: бросок ${roll}, вы ${delta >= 0 ? `получаете ${amount} монет` : `теряете ${amount} монет`}.`,
                  type: delta >= 0 ? 'success' : 'warning',
                  cardId: card.id,
                  timestamp: Date.now(),
                }
              });
            }

            notify(resultMsg, delta >= 0 ? 'success' : 'warning', card.id);
            logEvent({
              id: `judge_coins_result_${card.id}_${Date.now()}`,
              timestamp: Date.now(),
              type: 'coin_change',
              message: `${playerData.login} использовал "Судья душ": бросок ${roll}, ${affectedPlayerName} ${resultText}.`,
              playerId: user.uid,
              targetPlayerId: affectedPlayerId,
              cardId: card.id,
              details: { roll, delta, target: affectedPlayerName, reflected: isHostile && targetHasReflect }
            });
          } else {
            notify("Выберите игрока для карты \"Судья душ\".", 'warning', card.id);
          }
          break;
        case "deal_with_mage": {
          const roll = rollD6();
          const timestamp = Date.now();
          const mageCardName = "Сделка с магом";

          if (roll === 1) {
            const message = `Сделка с магом: бросок ${roll}. Монет нет, маг отправляет вас на gambling.`;
            await updateDoc(doc(db, "gameState", "current"), {
              activeInteraction: {
                playerId: user.uid,
                type: "gambling",
                cards: getRandomInteractionCards("gambling"),
              },
            });
            await updateDoc(playerRef, {
              lastNotification: { message, timestamp, cardId: card.id },
            });
            notify(message, 'warning', card.id);
            logEvent({
              id: `mage_deal_${card.id}_${timestamp}`,
              timestamp,
              type: 'card_play',
              message: `${playerData.login} использовал "${mageCardName}": бросок ${roll}, открыт gambling без монет.`,
              playerId: user.uid,
              cardId: card.id,
              details: { roll, coins: 0, gambling: true }
            });
          } else if (roll <= 4) {
            const message = `Сделка с магом: бросок ${roll}. Вы получаете ${card.value} монет и отправляетесь на gambling.`;
            await updateDoc(playerRef, {
              tiltCoins: increment(card.value),
              lastNotification: { message, timestamp, cardId: card.id },
            });
            await updateDoc(doc(db, "gameState", "current"), {
              activeInteraction: {
                playerId: user.uid,
                type: "gambling",
                cards: getRandomInteractionCards("gambling"),
              },
            });
            notify(message, 'info', card.id);
            logEvent({
              id: `mage_deal_${card.id}_${timestamp}`,
              timestamp,
              type: 'coin_change',
              message: `${playerData.login} использовал "${mageCardName}": бросок ${roll}, +${card.value} монет и открыт gambling.`,
              playerId: user.uid,
              cardId: card.id,
              details: { roll, coins: card.value, gambling: true }
            });
          } else {
            const message = `Сделка с магом: бросок ${roll}. Вы получаете ${card.value} монет. Gambling не открывается.`;
            await updateDoc(playerRef, {
              tiltCoins: increment(card.value),
              lastNotification: { message, timestamp, cardId: card.id },
            });
            notify(message, 'success', card.id);
            logEvent({
              id: `mage_deal_${card.id}_${timestamp}`,
              timestamp,
              type: 'coin_change',
              message: `${playerData.login} использовал "${mageCardName}": бросок ${roll}, +${card.value} монет без gambling.`,
              playerId: user.uid,
              cardId: card.id,
              details: { roll, coins: card.value, gambling: false }
            });
          }
          break;
        }
        case "discard_card":
          if (targetRef && targetPlayerId) {
            if (targetHasFish) {
              await updateDoc(targetRef, clearTemporaryStatus); // Clear fish shield
              notify("Событие игры обновлено.", 'warning');
              break;
            }

            const victimId = targetHasReflect ? user.uid : targetPlayerId;
            const victim = getPlayerById(victimId);

            if (!victim || !victim.inventory || victim.inventory.length === 0) {
              notify("Событие игры обновлено.", 'info');
              break;
            }

            if (targetHasReflect) {
              await updateDoc(targetRef, clearTemporaryStatus);
            }

            // Текст восстановлен после сбоя кодировки.
            await updateDoc(doc(db, "gameState", "current"), {
              activeInteraction: {
                playerId: user.uid,
                type: "discard_selection",
                targetPlayerId: victimId,
                // Текст восстановлен после сбоя кодировки.
                cards: shuffle(victim.inventory),
                actingCardId: card.id,
              }
            });
            if (targetHasReflect) alert("Событие игры обновлено.");
          }
          break;

        case "steal_card":
          if (targetRef && targetPlayerId) {
            if (targetHasFish) {
              await updateDoc(targetRef, clearTemporaryStatus);
              alert("Событие игры обновлено.");
              break;
            }

            const victimId = targetHasReflect ? user.uid : targetPlayerId;
            const victim = getPlayerById(victimId);
            const recipientId = targetHasReflect ? targetPlayerId : user.uid;

            if (!victim || !victim.inventory || victim.inventory.length === 0) {
              alert("Событие игры обновлено.");
              break;
            }

            if (targetHasReflect) {
              await updateDoc(targetRef, clearTemporaryStatus);
            }

            // Текст восстановлен после сбоя кодировки.
            await updateDoc(doc(db, "gameState", "current"), {
              activeInteraction: {
                playerId: user.uid,
                type: "discard_selection",
                targetPlayerId: victimId,
                recipientId: recipientId,
                // Текст восстановлен после сбоя кодировки.
                cards: shuffle(victim.inventory),
                actingCardId: card.id,
              }
            });
            notify("Событие игры обновлено.", 'warning');
          }
          break;

        case "reflect_debuff":
          await updateDoc(playerRef, {
            customStatus: "reflect_debuff",
            statusDuration: 1,
          });
          notify("Событие игры обновлено.", 'info');
          break;

        case "move_target_for_coins": {
          if (!targetRef || !targetPlayerId) {
            notify("Событие игры обновлено.", 'warning');
            break;
          }

            if (targetHasFish) {
              await updateDoc(targetRef, clearTemporaryStatus);
              notify("Событие игры обновлено.", 'warning');
              break;
            }
            const steps = Math.min(playerData.tiltCoins ?? 0, 6);
            if (steps <= 0) {
              // This alert will be handled by AppClean.tsx
              // Текст восстановлен после сбоя кодировки.
              await updateDoc(playerRef, { inventory: playerData.inventory ?? [card.id] }); // Return card if no coins
              await updateDoc(doc(db, "gameState", "current"), { revealedCards: arrayRemove(card.id) });
              break;
            }
            const actualTargetId = targetHasReflect ? user.uid : targetPlayerId;
            // const actualTargetRef = doc(db, "players", actualTargetId); // Not needed here, will be used in handleConfirmMoveForCoins
            // const actualTarget = getPlayerById(actualTargetId); // Not needed here

            if (targetHasReflect) {
              await updateDoc(targetRef, clearTemporaryStatus);
            }

            // Trigger interaction to ask for coins
            await updateDoc(doc(db, "gameState", "current"), {
              activeInteraction: {
                playerId: user.uid,
                type: "move_for_coins_selection",
                cards: [],
                targetPlayerId: actualTargetId,
                actingCardId: card.id,
              },
            });
            logEvent({
              id: `move_for_coins_start_${card.id}_${Date.now()}`,
              timestamp: Date.now(), type: 'card_play',
              message: "Событие игры.",
              playerId: user.uid, targetPlayerId: targetPlayer?.id, cardId: card.id,
              details: { reflected: targetHasReflect }
            });
            break;
        }

        case "discard_next_drawn":
          await updateDoc(playerRef, { discardNextDrawn: true });
          notify("Событие игры обновлено.", 'info');
          logEvent({
            id: `discard_next_drawn_${card.id}_${Date.now()}`,
            timestamp: Date.now(), type: 'status_effect',
            message: "Событие игры.",
            playerId: user.uid, cardId: card.id,
            details: { status: 'discardNextDrawn' }
          });
          break;

        case "duel": {
          if (!targetRef || !targetPlayerId || !targetPlayer) {
            notify("Событие игры обновлено.", 'warning');
            logEvent({
              id: `duel_fail_${card.id}_${Date.now()}`,
              timestamp: Date.now(), type: 'error',
              message: "Событие игры.",
              cardId: card.id, playerId: user.uid
            });
            break;
          }

          const duelChallengerId = user.uid;
          const duelTargetId = targetPlayerId;
          const duelCardId = card.id;

          const targetHasFishProtection = targetPlayer.inventory?.includes("inv_006");

          // Текст восстановлен после сбоя кодировки.
          const newDuelId = `duel_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          const challengerWaitMessage = `Вы вызвали ${targetPlayer.login} на дуэль. Ожидаем ответа.`;

          const initialDuelState: DuelState = {
            id: newDuelId,
            challengerId: duelChallengerId,
            targetId: duelTargetId,
            status: 'pending',
            weapon: null,
            bets: {
              [duelChallengerId]: 0,
              [duelTargetId]: 0,
            },
            isReady: {
              [duelChallengerId]: false,
              [duelTargetId]: false,
            }
          };

          await updateDoc(doc(db, "gameState", "current"), {
            [`activeDuels.${newDuelId}`]: initialDuelState,
            activeInteraction: {
              playerId: duelTargetId,
              type: "duel_challenge_response",
              duelId: newDuelId,
              cards: targetHasFishProtection ? ["inv_006"] : [],
              actingCardId: duelCardId,
              targetPlayerId: duelChallengerId,
            },
          });

          await updateDoc(playerRef, {
            lastNotification: {
              message: challengerWaitMessage,
              timestamp: Date.now(),
              cardId: duelCardId,
            },
          });

          logEvent({
            id: `duel_challenge_${card.id}_${Date.now()}`,
            timestamp: Date.now(), type: 'duel',
            message: `${playerData.login} вызвал ${targetPlayer.login} на дуэль.`,
            playerId: user.uid, targetPlayerId: targetPlayer.id, cardId: card.id,
            details: { status: 'pending', canUseProtection: targetHasFishProtection }
          });
          break;
        }

        case "move_target_and_self":
          if (targetRef && targetPlayerId) {
            if (targetHasFish) {
              await updateDoc(targetRef, clearTemporaryStatus);
              notify("Событие игры обновлено.", 'warning');
              logEvent({
                id: `move_and_self_blocked_${card.id}_${Date.now()}`,
                timestamp: Date.now(), type: 'status_effect',
                message: "Событие игры.",
                playerId: targetPlayer?.id, targetPlayerId: user.uid, cardId: card.id,
                details: { protectionCard: 'inv_006' }
              });
              break;
            }
            await updateDoc(targetRef, {
              position: (targetPlayer?.position ?? 0) + 2,
              prevCell: null,
            });
            await updateDoc(playerRef, {
              position: Math.max(0, (playerData.position ?? 0) - 1),
              prevCell: null,
            });
            notify("Событие игры обновлено.", 'info');
            logEvent({
              id: `move_and_self_${card.id}_${Date.now()}`,
              timestamp: Date.now(), type: 'movement',
              message: "Событие игры.",
              playerId: user.uid, targetPlayerId: targetPlayer?.id, cardId: card.id,
              details: { selfMove: -1, targetMove: 2 }
            });
          }
          break;

        case "pay_or_move_back":
          {
            // Текст восстановлен после сбоя кодировки.
            const targetIds = targetPlayerId 
              ? [targetPlayerId] 
              : players.filter(p => p.id !== user.uid && p.inGame && p.role !== 'admin').map(p => p.id);

            for (const pid of targetIds) {
              const tRef = doc(db, "players", pid);
              const tData = getPlayerById(pid);
              if (!tData) continue;

              const hasFish = tData.customStatus === "fish_shield";
              const hasReflect = tData.customStatus === "reflect_debuff";
              const hasPromoCode = tData.customStatus === "promo_code_active";
              
              if (hasFish) {
                await updateDoc(tRef, clearTemporaryStatus);
                notify("Событие игры обновлено.", 'warning');
                continue;
              }

              const actualPRef = hasReflect ? playerRef : tRef;
              const actualRecipientRef = hasReflect ? tRef : playerRef;
              const victimData = hasReflect ? playerData : tData;

              if (hasReflect) await updateDoc(tRef, clearTemporaryStatus);

              const currentCoins = victimData.tiltCoins ?? 0;
              let paymentAmount = card.value;
              if (hasPromoCode) {
                paymentAmount = Math.ceil(card.value / 2); // Victim pays half, rounding up
                await updateDoc(actualPRef, clearTemporaryStatus); // Clear promo code status
                notify("Событие игры обновлено.", 'success');
                logEvent({
                  id: `promo_code_used_taxes_${card.id}_${Date.now()}`,
                  timestamp: Date.now(), type: 'status_effect',
                  message: "Событие игры.",
                  playerId: victimData.id, cardId: card.id,
                  details: { originalAmount: card.value, finalAmount: paymentAmount }
                });
              }

              if (currentCoins >= paymentAmount) { // Use adjusted paymentAmount
                await runTransaction(db, async (transaction) => {
                  transaction.update(actualPRef, { tiltCoins: increment(-paymentAmount) });
                  transaction.update(actualRecipientRef, { tiltCoins: increment(paymentAmount) });
                });
                notify("Событие игры обновлено.", 'info');
              } else {
                // Текст восстановлен после сбоя кодировки.
                const gamblingCards = getRandomInteractionCards("gambling");
                const randomMomentalCardId = pickRandom(gamblingCards);
                const randomMomentalCard = randomMomentalCardId ? allCards[randomMomentalCardId] : null;

                if (randomMomentalCard) {
                  await runTransaction(db, async (transaction) => {
                    await applyMomentalCardEffect(victimData, randomMomentalCard, transaction);
                  });
                  notify("Событие игры обновлено.", 'warning');
                  logEvent({
                    id: `taxes_gambling_${card.id}_${Date.now()}`,
                    timestamp: Date.now(), type: 'status_effect',
                    message: "Событие игры.",
                    playerId: victimData.id, cardId: card.id,
                    details: { reason: 'failed_to_pay_taxes', momentalCardId: randomMomentalCard.id }
                  });
                } else {
                  notify("Событие игры обновлено.", 'error');
                }
              }
            }
          }
          break;

        case "take_next_card": {
          const nextPlayerId = getNextPlayerId(user.uid);
          if (!nextPlayerId) {
            notify("Событие игры обновлено.", 'warning');
            logEvent({
              id: `take_next_card_fail_${card.id}_${Date.now()}`,
              timestamp: Date.now(), type: 'info',
              message: "Событие игры.",
              playerId: user.uid, cardId: card.id,
              details: { outcome: 'no_next_player' }
            });
            break;
          }
          await updateDoc(doc(db, "players", nextPlayerId), {
            redirectNextDrawnToPlayerId: user.uid,
          });
          notify("Событие игры обновлено.", 'info');
          logEvent({
            id: `take_next_card_${card.id}_${Date.now()}`,
            timestamp: Date.now(), type: 'status_effect',
            message: "Событие игры.",
            playerId: user.uid, targetPlayerId: nextPlayerId, cardId: card.id,
            details: { effect: 'redirect_next_drawn' }
          });
          break;
        }

        case "give_next_card": {
          const nextPlayerId = getNextPlayerId(user.uid);
          if (!nextPlayerId) {
            notify("Событие игры обновлено.", 'warning');
            logEvent({
              id: `give_next_card_fail_${card.id}_${Date.now()}`,
              timestamp: Date.now(), type: 'info',
              message: "Событие игры.",
              playerId: user.uid, cardId: card.id,
              details: { outcome: 'no_next_player' }
            });
            break;
          }
          await updateDoc(playerRef, { giveNextDrawnToPlayerId: nextPlayerId });
          notify("Событие игры обновлено.", 'info');
          logEvent({
            id: `give_next_card_${card.id}_${Date.now()}`,
            timestamp: Date.now(), type: 'status_effect',
            message: "Событие игры.",
            playerId: user.uid, targetPlayerId: nextPlayerId, cardId: card.id,
            details: { effect: 'give_next_drawn' }
          });
          break;
        }

        case "communism":
          if (targetRef && targetPlayerId && targetPlayer) {
            if (targetHasFish) {
              await updateDoc(targetRef, clearTemporaryStatus);
              notify("Событие игры обновлено.", 'warning');
              break;
            }

            const actualTargetRef = targetHasReflect ? playerRef : targetRef;
            const actualRecipientRef = targetHasReflect ? targetRef : playerRef;
            const victimData = targetHasReflect ? playerData : targetPlayer;
            
            if (targetHasReflect) {
              await updateDoc(targetRef, clearTemporaryStatus);
              notify("Событие игры обновлено.", 'warning');
            }

            // Текст восстановлен после сбоя кодировки.
            // Текст восстановлен после сбоя кодировки.
            // Текст восстановлен после сбоя кодировки.
            const currentVictimCoins = victimData.tiltCoins ?? 0;
            const stealAmount = Math.floor(currentVictimCoins / 2);

            if (stealAmount > 0) {
              await runTransaction(db, async (transaction) => {
                transaction.update(actualTargetRef, { tiltCoins: increment(-stealAmount) });
                transaction.update(actualRecipientRef, { tiltCoins: increment(stealAmount) });
              });
              
              const victimName = targetHasReflect ? "\u0446\u0435\u043b\u044c" : targetPlayer.login;
              const getterName = targetHasReflect ? targetPlayer.login : "\u0446\u0435\u043b\u044c";
              notify(`${getterName} \u043f\u043e\u043b\u0443\u0447\u0438\u043b ${stealAmount} \u043c\u043e\u043d\u0435\u0442 \u043e\u0442 ${victimName}.`, 'success');
              
              logEvent({
                id: `communism_${card.id}_${Date.now()}`,
                timestamp: Date.now(), type: 'coin_change',
                message: `${getterName} \u043f\u043e\u043b\u0443\u0447\u0438\u043b ${stealAmount} \u043c\u043e\u043d\u0435\u0442 \u043e\u0442 ${victimName}.`,
                playerId: user.uid, targetPlayerId: targetPlayerId ?? undefined, cardId: card.id,
                details: { amount: stealAmount, reflected: targetHasReflect }
              });
            } else {
              notify("Событие игры обновлено.", 'info');
            }
          }
          break;
        
        case "promo_code_benefit":
          await updateDoc(playerRef, {
            customStatus: "promo_code_active",
            statusDuration: 1, // Lasts for one "event"
          });
          notify("Событие игры обновлено.", 'info');
          logEvent({
            id: `promo_code_activated_${card.id}_${Date.now()}`,
            timestamp: Date.now(), type: 'status_effect',
            message: "Событие игры.",
            playerId: user.uid, cardId: card.id,
            details: { status: 'promo_code_active' }
          });
          break;



        default:
          console.warn("\u041d\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043d\u043e\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u043a\u0430\u0440\u0442\u044b:", card.action);
          notify("Событие игры обновлено.", 'error');
      }
    } catch (e) {
      console.error(e);
      await updateDoc(playerRef, { inventory: playerData.inventory ?? [card.id] }).catch(() => {
        console.error("Ошибка действия.");
      });
      await updateDoc(doc(db, "gameState", "current"), { revealedCards: arrayRemove(card.id) }).catch(() => {
        console.error("Ошибка действия.");
      });
      notify("Событие игры обновлено.", 'error');
    }
  };

  const getRandomInteractionCards = useCallback(
    (type: "gambling" | "bshop"): string[] => {
      const cardsArray = Object.values(allCards).filter((card): card is GameCard => Boolean(card?.id && card.deck && card.rarity));
      if (cardsArray.length === 0) return [];
      const result: string[] = [];

      for (let i = 0; i < 3; i += 1) {
        if (type === "bshop") {
          const pool = cardsArray.filter(
            (card) => card.deck === "inventory" && typeof card.price === 'number',
          );
          const selected = pickRandom(pool);
          if (selected) result.push(selected.id);
        } else {
          const rarity = pickWeighted(
            GAMBLING_RARITY_WEIGHTS.filter(({ rarity }) =>
              cardsArray.some((card) => card.rarity === rarity),
            ),
            ({ weight }) => weight,
          )?.rarity;

          const pool = rarity
            ? cardsArray.filter((card) => card.rarity === rarity)
            : cardsArray.filter((card) => card.rarity !== "legendary");

          const selected = pickWeighted(
            pool,
            (card) => (card.deck === "momental" ? GAMBLING_MOMENTAL_WEIGHT : 1),
          );
          if (selected) result.push(selected.id);
        }
      }

      return result;
    },
    [allCards],
  );

  // Текст восстановлен после сбоя кодировки.
  const handleDrawnCardDistribution = useCallback(
    async (
      player: Player,
      card: GameCard,
      transaction: any,
    ) => {
      const playerRef = doc(db, "players", player.id);
      let suppressCard = false;
      let finalRecipientId = player.id;

      if (player.redirectNextDrawnToPlayerId) {
        finalRecipientId = player.redirectNextDrawnToPlayerId;
      } else if (player.giveNextDrawnToPlayerId) {
        finalRecipientId = player.giveNextDrawnToPlayerId;
      }

      const finalRecipientRef = doc(db, "players", finalRecipientId);
      let recipientInventory = player.inventory;
      if (finalRecipientId !== player.id) {
        const recipientSnap = await transaction.get(finalRecipientRef);
        recipientInventory = (recipientSnap.data() as Player | undefined)?.inventory;
      }

      if (player.discardNextDrawn) {
        suppressCard = true;
        transaction.update(playerRef, { discardNextDrawn: false });
        notify("Событие игры обновлено.", 'info');
        logEvent({
          id: `card_discarded_by_effect_${card.id}_${Date.now()}`,
          timestamp: Date.now(), type: 'card_play',
          message: "Событие игры.",
          playerId: player.id, cardId: card.id,
          details: { reason: 'discard_next_drawn' }
        });
      } else if (player.redirectNextDrawnToPlayerId) {
        transaction.update(playerRef, { redirectNextDrawnToPlayerId: null });
        notify("Событие игры обновлено.", 'info');
      } else if (player.giveNextDrawnToPlayerId) {
        transaction.update(playerRef, { giveNextDrawnToPlayerId: null });
        notify("Событие игры обновлено.", 'info');
      }

      if (!suppressCard) {
        transaction.update(finalRecipientRef, {
          inventory: addOneCardToInventory(recipientInventory, card.id),
        });
      }
    },
    [notify, logEvent]
  );
  const handleSelectOpponentCard = async (targetPlayerId: string, cardId: string) => {
    if (!user || !playerData) return;

    // --- START: Golden Card Protection (inv_018) ---
    if (cardId === "inv_018") {
      notify("Событие игры обновлено.", 'warning');
      logEvent({
        id: `golden_card_protection_${cardId}_${Date.now()}`,
        timestamp: Date.now(), type: 'warning',
        message: "Событие игры.",
        playerId: user.uid, targetPlayerId: targetPlayerId, cardId: cardId,
        details: { action: 'steal_or_discard', outcome: 'blocked' }
      });
      await updateDoc(doc(db, "gameState", "current"), { activeInteraction: null });
      return;
    }
    // --- END: Golden Card Protection ---

    if (!user || !playerData) return;

    console.log("\u0412\u044b\u0431\u043e\u0440 \u043a\u0430\u0440\u0442\u044b \u0441\u043e\u043f\u0435\u0440\u043d\u0438\u043a\u0430:", targetPlayerId, "\u043a\u0430\u0440\u0442\u0430:", cardId);
    const targetRef = doc(db, "players", targetPlayerId);
    const cardName = allCards[cardId]?.name || "\u043d\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043d\u0430\u044f \u043a\u0430\u0440\u0442\u0430";
    const actingCardId = gameState.activeInteraction?.actingCardId;

    try {
      await runTransaction(db, async (transaction) => {
        const gsRef = doc(db, "gameState", "current");
        const gsSnap = await transaction.get(gsRef);
        if (!gsSnap.exists()) return;

        const interaction = (gsSnap.data() as GameState).activeInteraction;
        const isSteal = interaction?.actingCardId === "inv_011";
        const recipientId = interaction?.recipientId;
        const targetSnap = await transaction.get(targetRef);
        const targetInventory = (targetSnap.data() as Player | undefined)?.inventory;
        let recipientInventory: string[] | undefined;
        if (isSteal && recipientId) {
          const recipientSnap = await transaction.get(doc(db, "players", recipientId));
          recipientInventory = (recipientSnap.data() as Player | undefined)?.inventory;
        }

        // Текст восстановлен после сбоя кодировки.
        transaction.update(targetRef, {
          inventory: removeOneCardFromInventory(targetInventory, cardId),
          // Текст восстановлен после сбоя кодировки.
          lastNotification: {
            message: isSteal 
              ? `\u0418\u0433\u0440\u043e\u043a "${playerData.login}" \u0437\u0430\u0431\u0440\u0430\u043b \u0443 \u0432\u0430\u0441 \u043a\u0430\u0440\u0442\u0443 "${cardName}"`
              : `\u0418\u0433\u0440\u043e\u043a "${playerData.login}" \u0441\u0431\u0440\u043e\u0441\u0438\u043b \u0432\u0430\u0448\u0443 \u043a\u0430\u0440\u0442\u0443 "${cardName}"`,
            timestamp: Date.now(),
            cardId: cardId
          }
        });

        // Текст восстановлен после сбоя кодировки.
        if (isSteal && recipientId) {
          const recipientRef = doc(db, "players", recipientId);
          transaction.update(recipientRef, {
            inventory: addOneCardToInventory(recipientInventory, cardId)
          });
        }

        // Текст восстановлен после сбоя кодировки.
        transaction.update(gsRef, {
          activeInteraction: null
        });

        // Текст восстановлен после сбоя кодировки.
        transaction.update(gsRef, {
          revealedCards: arrayUnion(cardId)
        });
      });
    } catch (e) {
      console.error("Ошибка действия.");
      if (actingCardId) {
        await updateDoc(doc(db, "players", user.uid), { inventory: addOneCardToInventory(playerData.inventory, actingCardId) }).catch(() => {
          console.error("Ошибка действия.");
        });
        await updateDoc(doc(db, "gameState", "current"), {
          activeInteraction: null,
          revealedCards: arrayRemove(actingCardId),
        }).catch(() => {
          console.error("Ошибка действия.");
        });
      }
      notify("Событие игры обновлено.", 'error');
      logEvent({
        id: `select_opponent_card_error_${Date.now()}`,
        timestamp: Date.now(), type: 'error',
        message: "Событие игры.",
        playerId: user.uid, targetPlayerId: targetPlayerId, cardId: cardId,
        details: { error: e }
      });

    }
  };

  // New handler for confirming coin payment and initiating move for inv_013
  const handleConfirmMoveForCoins = async (steps: number) => {
    if (!user || !playerData || !gameState.activeInteraction || gameState.activeInteraction.type !== "move_for_coins_selection") {
      console.error("Invalid state for handleConfirmMoveForCoins");
      return;
    }

    const { targetPlayerId, actingCardId, playerId } = gameState.activeInteraction;
    if (!targetPlayerId) {
      console.error("Target player not found for active interaction");
      return;
    }
    if (!actingCardId) {
      console.error("Card not found for active interaction:", actingCardId);
      return;
    }
    const card = allCards[actingCardId];
    if (!card) {
      console.error("Card not found for active interaction:", actingCardId);
      return;
    }

    const playerRef = doc(db, "players", user.uid);
    const gameStateRef = doc(db, "gameState", "current");

    try {
      await runTransaction(db, async (transaction) => {
        const pSnap = await transaction.get(playerRef);
        if (!pSnap.exists()) throw new Error("Player data not found");
        const currentPlayerCoins = pSnap.data()?.tiltCoins || 0;

        if (currentPlayerCoins < steps) {
          throw new Error("Ошибка действия.");
        }

        // Deduct coins from the card user
        transaction.update(playerRef, { tiltCoins: increment(-steps) });
        // Remove one copy of the card from the card user's inventory
        transaction.update(playerRef, { inventory: removeOneCardFromInventory((pSnap.data() as Player).inventory, card.id) });
        // Add the card to revealed cards
        transaction.update(gameStateRef, { revealedCards: arrayUnion(card.id) });

        const timestamp = Date.now();

        transaction.update(playerRef, {
          lastNotification: {
            message: "Событие игры.",
            timestamp,
            cardId: card.id,
          },
        });

        // Trigger card-controlled movement without touching the dice roll.
        transaction.update(gameStateRef, {
          cardMove: {
            id: `${card.id}_${timestamp}`,
            controllerId: playerId,
            controllerName: playerData.login,
            targetId: targetPlayerId,
            steps,
            cardId: card.id,
            cardName: card.name,
          },
          currentRoll: null,
          currentRollPlayerId: null,
          lastBaseRoll: null,
          rollConfirmed: false,
          forcedMovePlayerId: null,
          activeInteraction: null,
        });
      });
    } catch (e) {
      console.error("Ошибка действия.");
      await updateDoc(playerRef, { inventory: addOneCardToInventory(playerData.inventory, card.id) }).catch(() => {
        console.error("Ошибка действия.");
      });
      await updateDoc(gameStateRef, {
        activeInteraction: null,
        revealedCards: arrayRemove(card.id),
      }).catch(() => {
        console.error("Ошибка действия.");
      });
      notify("Событие игры обновлено.", 'error');
      logEvent({
        id: `confirm_move_for_coins_error_${Date.now()}`,
        timestamp: Date.now(), type: 'error',
        message: "Событие игры.",
        playerId: user.uid, targetPlayerId: targetPlayerId, cardId: actingCardId,
        details: { error: e }
      });

    }
  };

  const handleCancelInteraction = async () => {
    if (!user || !playerData || !gameState.activeInteraction) return;

    const { actingCardId } = gameState.activeInteraction;
    const playerRef = doc(db, "players", user.uid);
    const gsRef = doc(db, "gameState", "current");

    try {
      await runTransaction(db, async (transaction) => {
        // Текст восстановлен после сбоя кодировки.
        if (actingCardId) {
          transaction.update(playerRef, { inventory: addOneCardToInventory(playerData.inventory, actingCardId) });
          transaction.update(gsRef, { revealedCards: arrayRemove(actingCardId) });
        }
        // Текст восстановлен после сбоя кодировки.
        transaction.update(gsRef, { activeInteraction: null });
      });
    } catch {
      console.error("Ошибка действия.");
      notify("Событие игры обновлено.", 'error');
      logEvent({
        id: `cancel_interaction_error_${Date.now()}`,
        timestamp: Date.now(), type: 'error',
        message: "Событие игры.",
        playerId: user.uid, cardId: actingCardId,
      });
    }
  };

  const handleDuelChallengeResponse = async (duelId: string, response: 'accept' | 'use_protection' | 'decline') => {
    if (!user || !playerData) return;

    const gameStateRef = doc(db, "gameState", "current");
    const playerRef = doc(db, "players", user.uid);
    const duelState = gameState.activeDuels[duelId];

    if (!duelState || duelState.targetId !== user.uid) {
      console.error("Ошибка действия.");
      return;
    }

    const challengerPlayer = getPlayerById(duelState.challengerId);
    const duelCard = allCards[gameState.activeInteraction?.actingCardId || '']; // inv_015
    const challengerName = challengerPlayer?.login || "Игрок";
    const targetName = playerData.login || "Игрок";

    try {
      await runTransaction(db, async (transaction) => {
        const currentGameState = (await transaction.get(gameStateRef)).data() as GameState;
        const currentDuelState = currentGameState.activeDuels[duelId];

        if (!currentDuelState) {
          throw new Error("Ошибка действия.");
        }

        const responseTimestamp = Date.now();

        if (response === 'decline') {
          const challengerRef = doc(db, "players", currentDuelState.challengerId);
          const declineFee = 3;
          const targetMessage = "Вы отказались от дуэли и заплатили 3 монеты.";
          const challengerMessage = `${targetName} отказался от дуэли и отдал вам 3 монеты.`;

          const updatedActiveDuels = { ...currentGameState.activeDuels };
          delete updatedActiveDuels[duelId];

          transaction.update(playerRef, {
            tiltCoins: increment(-declineFee),
            lastNotification: {
              message: targetMessage,
              timestamp: responseTimestamp,
              cardId: duelCard?.id,
            },
          });
          transaction.update(challengerRef, { tiltCoins: increment(declineFee) });
          transaction.update(gameStateRef, {
            activeDuels: updatedActiveDuels,
            activeInteraction: null,
            [`notifications.${currentDuelState.challengerId}`]: {
              message: challengerMessage,
              timestamp: responseTimestamp,
              cardId: duelCard?.id,
            },
          });
          logEvent({
            id: `duel_declined_${duelId}_${Date.now()}`,
            timestamp: Date.now(), type: 'duel',
            message: challengerMessage,
            playerId: user.uid, targetPlayerId: challengerPlayer?.id, cardId: duelCard?.id,
            details: { outcome: 'declined', fee: declineFee }
          });
        } else if (response === 'use_protection') {
          // Текст восстановлен после сбоя кодировки.
          const protectionCardId = "inv_006";
          const targetMessage = `Вы сбросили дуэль картой "No, no, no mr. Fish".`;
          const challengerMessage = `Дуэль сброшена картой "No, no, no mr. Fish", вы возвращаетесь ни с чем.`;
          if (!playerData.inventory?.includes(protectionCardId)) {
            throw new Error("Ошибка действия.");
          }

          // Текст восстановлен после сбоя кодировки.
          transaction.update(playerRef, { inventory: removeOneCardFromInventory(playerData.inventory, protectionCardId) });
          // Текст восстановлен после сбоя кодировки.
          transaction.update(gameStateRef, { revealedCards: arrayUnion(protectionCardId) });

          // Текст восстановлен после сбоя кодировки.
          const updatedActiveDuels = { ...currentGameState.activeDuels };
          delete updatedActiveDuels[duelId];
          transaction.update(gameStateRef, { activeDuels: updatedActiveDuels });

          // Текст восстановлен после сбоя кодировки.
          transaction.update(gameStateRef, { activeInteraction: null });

          // Текст восстановлен после сбоя кодировки.
          transaction.update(playerRef, {
            lastNotification: {
              message: targetMessage,
              timestamp: responseTimestamp,
              cardId: protectionCardId
            }
          });
          logEvent({
            id: `duel_avoided_${duelId}_${Date.now()}`,
            timestamp: Date.now(), type: 'duel',
            message: `${targetName} сбросил дуэль картой "No, no, no mr. Fish".`,
            playerId: user.uid, targetPlayerId: challengerPlayer?.id, cardId: protectionCardId,
            details: { outcome: 'avoided' }
          });

          transaction.update(gameStateRef, {
            [`notifications.${currentDuelState.challengerId}`]: {
              message: challengerMessage,
              timestamp: responseTimestamp,
              cardId: duelCard?.id
            }
          });
        } else { // response === 'accept'
          const challengerMessage = `${targetName} принял вызов. Ожидаем решения.`;
          // Текст восстановлен после сбоя кодировки.
          transaction.update(gameStateRef, {
            [`activeDuels.${duelId}.status`]: 'accepted',
            activeInteraction: {
              playerId: currentDuelState.targetId,
              type: "duel_weapon_selection",
              duelId: duelId,
              cards: [],
              targetPlayerId: currentDuelState.targetId,
              actingCardId: duelCard?.id,
            },
            [`notifications.${currentDuelState.challengerId}`]: {
              message: challengerMessage,
              timestamp: responseTimestamp,
              cardId: duelCard?.id
            },
          });

          logEvent({
            id: `duel_accepted_${duelId}_${Date.now()}`,
            timestamp: Date.now(), type: 'duel',
            message: `${targetName} принял вызов на дуэль от ${challengerName}.`,
            playerId: user.uid, targetPlayerId: challengerPlayer?.id, cardId: duelCard?.id,
            details: { outcome: 'accepted' }
          });
        }
      });
    } catch {
      console.error("Ошибка действия.");
      notify("Событие игры обновлено.", 'error');
    }
  };

  const handlePlaceDuelBet = async (duelId: string, betAmount: number) => {
    if (!user || !playerData) return;

    const gameStateRef = doc(db, "gameState", "current");
    const playerRef = doc(db, "players", user.uid);

    try {
      await runTransaction(db, async (transaction) => {
        const gsSnap = await transaction.get(gameStateRef);
        const pSnap = await transaction.get(playerRef);
        if (!gsSnap.exists() || !pSnap.exists()) return;

        const gs = gsSnap.data() as GameState;
        const duel = gs.activeDuels?.[duelId];
        const normalizedBet = Math.floor(Number(betAmount));

        if (!duel) throw new Error("Ошибка действия.");
        if (duel.status !== 'betting') throw new Error("Ошибка действия.");
        if (normalizedBet <= 0) throw new Error("Ошибка действия.");

        transaction.update(playerRef, { tiltCoins: increment(-normalizedBet) });

        const updatedBets = { ...duel.bets, [user.uid]: normalizedBet };
        const updatedIsReady = { ...duel.isReady, [user.uid]: true };

        transaction.update(gameStateRef, {
          [`activeDuels.${duelId}.bets`]: updatedBets,
          [`activeDuels.${duelId}.isReady`]: updatedIsReady,
        });

        const allPlayersReady = Object.values(updatedIsReady).every(ready => ready === true);
        if (allPlayersReady) {
          if (duel.weapon === 'game') {
            transaction.update(gameStateRef, {
              [`activeDuels.${duelId}.status`]: 'admin_wait',
              activeInteraction: null,
            });
          } else {
            transaction.update(gameStateRef, {
              [`activeDuels.${duelId}.status`]: 'ready_to_roll',
              activeInteraction: {
                playerId: duel.challengerId,
                type: 'duel_ready_to_roll',
                duelId: duelId,
                targetPlayerId: duel.targetId,
                actingCardId: gs.activeInteraction?.actingCardId,
              },
            });
          }
        } else {
          const otherPlayerId = duel.challengerId === user.uid ? duel.targetId : duel.challengerId;
          transaction.update(gameStateRef, {
            activeInteraction: {
              playerId: otherPlayerId,
              type: 'duel_betting',
              duelId: duelId,
              targetPlayerId: duel.challengerId === user.uid ? duel.targetId : duel.challengerId,
              actingCardId: gs.activeInteraction?.actingCardId,
            },
          });
        }
      });
    } catch {
      console.error("Ошибка действия.");
      notify("Событие игры обновлено.", 'error');
    }
  };
  const handleStartDuelRoll = async (duelId: string) => {
    if (!user || !playerData) return;

    const gameStateRef = doc(db, "gameState", "current");

    try {
      await runTransaction(db, async (transaction) => {
        const gsSnap = await transaction.get(gameStateRef);
        if (!gsSnap.exists()) return;

        const gs = gsSnap.data() as GameState;
        const duel = gs.activeDuels?.[duelId];

        if (!duel) throw new Error("Ошибка действия.");
        if (duel.status !== 'ready_to_roll') throw new Error("Ошибка действия.");
        if (duel.challengerId !== user.uid) throw new Error("Ошибка действия.");

        if (duel.weapon === 'dice') {
          const challengerRoll = rollD6();
          const targetRoll = rollD6();
          transaction.update(gameStateRef, {
            [`activeDuels.${duelId}.status`]: 'rolling',
            [`activeDuels.${duelId}.rolls`]: {
              [duel.challengerId]: challengerRoll,
              [duel.targetId]: targetRoll,
            },
            activeInteraction: null,
          });
        } else {
          transaction.update(gameStateRef, {
            [`activeDuels.${duelId}.status`]: 'admin_wait',
            activeInteraction: null,
          });
        }
      });
    } catch {
      console.error("Ошибка действия.");
      notify("Событие игры обновлено.", 'error');
      logEvent({
        id: `duel_roll_start_error_${duelId}_${Date.now()}`,
        timestamp: Date.now(), type: 'error',
        message: "Событие игры.",
        playerId: user.uid, details: { duelId: duelId }
      });
    }
  };

  const handleSelectDuelWeapon = async (duelId: string, weapon: DuelWeapon) => {
    if (!user || !playerData) return;

    const gameStateRef = doc(db, "gameState", "current");

    try {
      await runTransaction(db, async (transaction) => {
        const gsSnap = await transaction.get(gameStateRef);
        if (!gsSnap.exists()) return;

        const gs = gsSnap.data() as GameState;
        const duel = gs.activeDuels?.[duelId];

        if (!duel) throw new Error("Ошибка действия.");

        // Текст восстановлен после сбоя кодировки.
        transaction.update(gameStateRef, {
          [`activeDuels.${duelId}.weapon`]: weapon,
          [`activeDuels.${duelId}.status`]: 'betting',
          // Текст восстановлен после сбоя кодировки.
          activeInteraction: {
            playerId: duel.challengerId,
            actingCardId: gs.activeInteraction?.actingCardId,
            type: 'duel_betting',
            duelId: duelId,
            targetPlayerId: duel.targetId
          }
        });
      });
    } catch {
      console.error("Ошибка действия.");
      notify("Событие игры обновлено.", 'error');
      logEvent({
        id: `duel_weapon_select_error_${duelId}_${Date.now()}`,
        timestamp: Date.now(), type: 'error',
        message: "Событие игры.",
        playerId: user.uid, details: { duelId: duelId, weapon: weapon }
      });
    }
  };

  const handleFinishDuel = async (duelId: string, manualWinnerId?: string | 'draw') => {
    if (!user || !playerData) return;

    const gameStateRef = doc(db, "gameState", "current");

    try {
      await runTransaction(db, async (transaction) => {
        const gsSnap = await transaction.get(gameStateRef);
        if (!gsSnap.exists()) return;

        const gs = gsSnap.data() as GameState;
        const duel = gs.activeDuels?.[duelId];

        if (!duel) throw new Error("Ошибка действия.");
        if (duel.status === 'finished' || (duel.weapon === 'game' && !manualWinnerId)) return;

        let winnerId: string | 'draw' = 'draw';
        let challengerRoll = 0;
        let targetRoll = 0;

        if (duel.weapon === 'dice') {
          challengerRoll = duel.rolls?.[duel.challengerId] ?? rollD6();
          targetRoll = duel.rolls?.[duel.targetId] ?? rollD6();

          if (challengerRoll > targetRoll) {
            winnerId = duel.challengerId;
          } else if (targetRoll > challengerRoll) {
            winnerId = duel.targetId;
          }
        } else if (duel.weapon === 'game' && manualWinnerId) {
          winnerId = manualWinnerId;
        }

        const challengerBet = duel.bets[duel.challengerId] || 0;
        const targetBet = duel.bets[duel.targetId] || 0;
        const totalPot = challengerBet + targetBet;
        const challengerLogin = getPlayerById(duel.challengerId)?.login || "\u0418\u0433\u0440\u043e\u043a 1";
        const targetLogin = getPlayerById(duel.targetId)?.login || "\u0418\u0433\u0440\u043e\u043a 2";
        const timestamp = Date.now();

        if (winnerId !== 'draw') {
          transaction.update(doc(db, "players", winnerId), {
            tiltCoins: increment(totalPot),
          });
        } else {
          transaction.update(doc(db, "players", duel.challengerId), {
            tiltCoins: increment(challengerBet),
          });
          transaction.update(doc(db, "players", duel.targetId), {
            tiltCoins: increment(targetBet),
          });
        }

        const getMessage = (isChallenger: boolean) => {
          const myRoll = isChallenger ? challengerRoll : targetRoll;
          const oppRoll = isChallenger ? targetRoll : challengerRoll;
          const myId = isChallenger ? duel.challengerId : duel.targetId;
          const opponentName = isChallenger ? targetLogin : challengerLogin;
          const isMeWinner = winnerId === myId;

          if (winnerId === 'draw') {
            return duel.weapon === 'dice'
              ? `\u0414\u0443\u044d\u043b\u044c: \u043d\u0438\u0447\u044c\u044f (${myRoll} vs ${oppRoll}). \u0421\u0442\u0430\u0432\u043a\u0430 \u0432\u043e\u0437\u0432\u0440\u0430\u0449\u0435\u043d\u0430.`
              : `\u0414\u0443\u044d\u043b\u044c: \u043d\u0438\u0447\u044c\u044f. \u0421\u0442\u0430\u0432\u043a\u0430 \u0432\u043e\u0437\u0432\u0440\u0430\u0449\u0435\u043d\u0430.`;
          }

          if (duel.weapon === 'dice') {
            return isMeWinner
              ? `\u041f\u043e\u0431\u0435\u0434\u0430! \u0412\u044b \u0432\u044b\u0438\u0433\u0440\u0430\u043b\u0438 \u0434\u0443\u044d\u043b\u044c (${myRoll} vs ${oppRoll}) \u0438 \u043f\u043e\u043b\u0443\u0447\u0438\u043b\u0438 ${totalPot} \u043c\u043e\u043d\u0435\u0442.`
              : `\u041f\u043e\u0440\u0430\u0436\u0435\u043d\u0438\u0435. \u0412\u044b \u043f\u0440\u043e\u0438\u0433\u0440\u0430\u043b\u0438 \u0434\u0443\u044d\u043b\u044c (${myRoll} vs ${oppRoll}) \u0438\u0433\u0440\u043e\u043a\u0443 ${opponentName}.`;
          }

          return isMeWinner
            ? `\u041f\u043e\u0431\u0435\u0434\u0430! \u0410\u0434\u043c\u0438\u043d \u043f\u0440\u0438\u0437\u043d\u0430\u043b \u0432\u0430\u0441 \u043f\u043e\u0431\u0435\u0434\u0438\u0442\u0435\u043b\u0435\u043c \u043a\u0430\u0441\u0442\u043e\u043c\u043d\u043e\u0439 \u0434\u0443\u044d\u043b\u0438. \u0412\u044b \u043f\u043e\u043b\u0443\u0447\u0438\u043b\u0438 ${totalPot} \u043c\u043e\u043d\u0435\u0442.`
            : `\u041f\u043e\u0440\u0430\u0436\u0435\u043d\u0438\u0435. \u0410\u0434\u043c\u0438\u043d \u043f\u0440\u0438\u0437\u043d\u0430\u043b \u043f\u043e\u0431\u0435\u0434\u0438\u0442\u0435\u043b\u0435\u043c \u0438\u0433\u0440\u043e\u043a\u0430 ${opponentName}.`;
        };

        const resultMessage = winnerId === 'draw'
          ? `\u0414\u0443\u044d\u043b\u044c \u043c\u0435\u0436\u0434\u0443 ${challengerLogin} \u0438 ${targetLogin} \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043b\u0430\u0441\u044c \u043d\u0438\u0447\u044c\u0435\u0439.`
          : `${getPlayerById(winnerId)?.login || '\u0418\u0433\u0440\u043e\u043a'} \u0432\u044b\u0438\u0433\u0440\u0430\u043b \u0434\u0443\u044d\u043b\u044c \u0443 ${winnerId === duel.challengerId ? targetLogin : challengerLogin}.`;

        transaction.update(gameStateRef, {
          [`activeDuels.${duelId}.status`]: 'finished',
          [`activeDuels.${duelId}.winnerId`]: winnerId,
          activeInteraction: null,
          [`notifications.${duel.challengerId}`]: {
            message: getMessage(true),
            timestamp,
          },
          [`notifications.${duel.targetId}`]: {
            message: getMessage(false),
            timestamp,
          },
        });

        logEvent({
          id: `duel_finished_${duelId}_${Date.now()}`,
          timestamp: Date.now(),
          type: 'duel',
          message: resultMessage,
          playerId: winnerId === 'draw' ? 'system' : winnerId,
          targetPlayerId: winnerId === 'draw' ? duel.targetId : undefined,
          details: {
            winnerId,
            weapon: duel.weapon,
            pot: totalPot,
            challengerRoll,
            targetRoll,
          },
        });
      });
    } catch {
      console.error("Ошибка действия.");
      notify("Событие игры обновлено.", 'error');
      logEvent({
        id: `duel_finish_error_${duelId}_${Date.now()}`,
        timestamp: Date.now(),
        type: 'error',
        message: "Событие игры.",
        playerId: user.uid,
        details: { duelId },
      });
    }
  };
  const handleMoveComplete = useCallback(
    async (
      position: number,
      prevCell: number | null,
      cellType?: string,
      playerId?: string,
      isCardMove: boolean = false,
    ) => {
      if (!user) return;
      const targetPlayerId = playerId || user.uid;
      const playerRef = doc(db, "players", targetPlayerId);
      const gameStateRef = doc(db, "gameState", "current");

      await runTransaction(db, async (transaction) => {
        const gsSnap = await transaction.get(gameStateRef);
        if (!gsSnap.exists()) return;
        const { turnOrder = [], currentTurnIndex = 0 } = gsSnap.data() as GameState;
        if (!isCardMove) {
          transaction.update(playerRef, { position, prevCell });
          logEvent({
            id: `player_move_manual_${targetPlayerId}_${Date.now()}`,
            timestamp: Date.now(), type: 'movement',
            message: "Событие игры.",
            playerId: targetPlayerId,
            details: { from: prevCell, to: position, isCardMove: isCardMove }
          });
        }


        if (cellType === "gambling" || cellType === "bshop") {
          transaction.update(gameStateRef, {
            activeInteraction: { 
              playerId: targetPlayerId,
              type: cellType,
              cards: getRandomInteractionCards(cellType),
              fromCardMove: isCardMove,
            },
            forcedMovePlayerId: null,
            cardMove: null,
          });
          notify("Событие игры обновлено.", 'info');
          logEvent({
            id: `landed_on_special_cell_${targetPlayerId}_${Date.now()}`,
            timestamp: Date.now(), type: 'movement',
            message: "Событие игры.",
            playerId: targetPlayerId, details: { cellType: cellType, position: position }
          });
          return;
        }

        if (isCardMove) {
          transaction.update(playerRef, { position, prevCell });
          transaction.update(gameStateRef, {
            forcedMovePlayerId: null,
            cardMove: null,
          });
          logEvent({
            id: `card_move_completed_${targetPlayerId}_${Date.now()}`,
            timestamp: Date.now(), type: 'movement',
            message: "Событие игры.",
            playerId: targetPlayerId,
            details: { from: prevCell, to: position, isCardMove: isCardMove }
          });
          return;
        }

        const isLast = currentTurnIndex === turnOrder.length - 1;
        transaction.update(gameStateRef, {
          phase: isLast ? "next_game" : "turn",
          currentTurnIndex: isLast ? 0 : currentTurnIndex + 1,
          currentRoll: null,
          currentRollPlayerId: null,
          lastBaseRoll: null,
          rollConfirmed: false,
          forcedMovePlayerId: null,
          cardMove: null,
        });
      });
    },
    [user, getRandomInteractionCards, notify, logEvent, getPlayerById], // Add notify and logEvent to dependencies
  );

  const handleFinishInteraction = async (
    cardId?: string,
    cost: number = 0,
    skipWithCardId?: string
  ) => {
    if (!user || !playerData || !gameState.activeInteraction) return;

    const playerRef = doc(db, "players", user.uid);
    const gameStateRef = doc(db, "gameState", "current");

    try {
      await runTransaction(db, async (transaction) => {
        const gsSnap = await transaction.get(gameStateRef);
        const pSnap = await transaction.get(playerRef);
        if (!gsSnap.exists() || !pSnap.exists()) return;

        const { turnOrder = [], currentTurnIndex = 0, activeInteraction } = gsSnap.data() as GameState;
        const player = { ...(pSnap.data() as Player), id: user.uid };

        let keepInteractionOpen = false;

        if (skipWithCardId) {
          transaction.update(playerRef, { inventory: removeOneCardFromInventory(player.inventory, skipWithCardId) });
          transaction.update(gameStateRef, { revealedCards: arrayUnion(skipWithCardId) });
          notify("Событие игры обновлено.", 'info');
          logEvent({
            id: `interaction_skipped_${skipWithCardId}_${Date.now()}`,
            timestamp: Date.now(), type: 'info',
            message: "Событие игры.",
            playerId: user.uid, cardId: skipWithCardId
          });
        } else if (cardId) {
          const card = allCards[cardId];
          if (!card) {
            notify("Карта не найдена. Попробуйте обновить страницу.", 'error');
            logEvent({
              id: `interaction_missing_card_${cardId}_${Date.now()}`,
              timestamp: Date.now(),
              type: 'error',
              message: `Не удалось завершить взаимодействие: карта ${cardId} не найдена.`,
              playerId: user.uid,
              cardId
            });
            return;
          }

          if (card.deck === "inventory") {
            if (cost > 0) {
              transaction.update(playerRef, { tiltCoins: increment(-cost) });
            }

            notify("Событие игры обновлено.", 'success');
            logEvent({
              id: `card_acquired_${card.id}_${Date.now()}`,
              timestamp: Date.now(), type: 'card_play',
              message: "Событие игры.",
              playerId: user.uid, cardId: card.id,
              details: { cost: cost, reason: cost > 0 ? 'buy_card' : 'interaction_reward' }
            });

            await handleDrawnCardDistribution(player, card, transaction);
          } else {
            keepInteractionOpen = await applyMomentalCardEffect(player, card, transaction, !!activeInteraction?.fromCardMove);
          }

          transaction.update(gameStateRef, { revealedCards: arrayUnion(cardId) });
        }

        if (keepInteractionOpen) {
          return;
        }

        if (activeInteraction?.fromCardMove) {
          transaction.update(gameStateRef, { activeInteraction: null });
          return;
        }

        const isLast = currentTurnIndex === turnOrder.length - 1;
        transaction.update(gameStateRef, {
          activeInteraction: null,
          phase: isLast ? "next_game" : "turn",
          currentTurnIndex: isLast ? 0 : currentTurnIndex + 1,
          currentRoll: null,
          currentRollPlayerId: null,
          lastBaseRoll: null,
          rollConfirmed: false,
        });
      });
    } catch (e) {
      console.error(e);
      notify("Событие игры обновлено.", 'error');
      logEvent({
        id: `finish_interaction_error_${Date.now()}`,
        timestamp: Date.now(), type: 'error',
        message: "Событие игры.",
        playerId: user.uid, cardId: cardId
      });
    }
  };

  const handleRoll = async () => {
    if (!user || !canRoll) return;
    const bonus = gameState.rollBonus || 0;
    const baseRoll = rollD6();

    await updateDoc(doc(db, "gameState", "current"), {
      currentRoll: baseRoll + bonus,
      lastBaseRoll: baseRoll,
      currentRollPlayerId: user.uid,
      rollConfirmed: false,
      rollBonus: 0,
    });
    logEvent({
      id: `dice_roll_${Date.now()}`,
      timestamp: Date.now(), type: 'movement',
      message: "Событие игры.",
      playerId: user.uid,
      details: { baseRoll: baseRoll, bonus: bonus, totalRoll: baseRoll + bonus }
    });
  };

  const handleConfirmRoll = async () => {
    if (!user || !canConfirmRoll) return;
    await updateDoc(doc(db, "gameState", "current"), { rollConfirmed: true });
  };

  const buildTurnState = () => {
    const resultEntries = Object.entries(gameState.currentResults ?? {});
    const hasCurrentResults = resultEntries.length > 0;
    const getRoundScore = (player: Player) =>
      hasCurrentResults
        ? Number(gameState.currentResults?.[player.id] ?? 0)
        : Number(player.lastTiltoCoins ?? 0);

    const activePlayers = players.filter((player) =>
      player.inGame &&
      player.role !== "admin" &&
      getRoundScore(player) > 0
    );
    const sortedIds = [...activePlayers]
      .sort((a, b) => {
        const scoreA = getRoundScore(a);
        const scoreB = getRoundScore(b);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return gameState.turnOrder.indexOf(a.id) - gameState.turnOrder.indexOf(b.id);
      })
      .map((player) => player.id);

    return {
      turnOrder: sortedIds,
      currentTurnIndex: 0,
      currentRoll: null,
      currentRollPlayerId: null,
      lastBaseRoll: null,
      rollBonus: 0,
      rollConfirmed: false,
      forcedMovePlayerId: null,
    };
  };

  const handleStepPhase = async (direction: -1 | 1) => {
    if (!isAdmin) return;
    const currentIndex = PHASE_ORDER.indexOf(gameState.phase);
    let nextIndex = (currentIndex === -1 ? 0 : currentIndex) + direction;
    let nextRound = gameState.round;

    if (nextIndex >= PHASE_ORDER.length) {
      nextIndex = 0;
      nextRound += 1;
    } else if (nextIndex < 0) {
      nextIndex = PHASE_ORDER.length - 1;
      if (nextRound > 0) nextRound -= 1;
    }

    const nextPhase = PHASE_ORDER[nextIndex];
    const hasUnresolvedCustomDuel = Object.values(gameState.activeDuels || {}).some(
      (duel) => duel.status === 'admin_wait'
    );

    if (hasUnresolvedCustomDuel) {
      notify("Событие игры обновлено.", 'warning');
      return;
    }

    const payload: Partial<GameState> = { phase: nextPhase, round: nextRound };

    if (nextPhase === "turn") {
      const turnState = buildTurnState();
      Object.assign(payload, turnState);
      if (turnState.turnOrder.length === 0) {
        notify("Очередь хода пуста: тестовый переход в ход без участников.", 'warning');
      }
    } else {
      payload.currentRoll = null;
      payload.currentRollPlayerId = null;
      payload.lastBaseRoll = null;
      payload.rollBonus = 0;
      payload.rollConfirmed = false;
    }

    if (payload.phase !== "turn") {
      payload.turnOrder = [];
      payload.currentTurnIndex = 0;
    }

    await updateDoc(doc(db, "gameState", "current"), payload);
  };

  const handleAdminUpdateCoins = async (targetId: string, amount: number) => {
    if (!isAdmin) return;
    try {
      await updateDoc(doc(db, "players", targetId), { tiltCoins: amount });
      notify("Событие игры обновлено.", 'success');
      logEvent({
        id: `admin_coin_update_${targetId}_${Date.now()}`,
        timestamp: Date.now(),
        type: 'coin_change',
        message: "Событие игры.",
        playerId: user?.uid || 'admin',
        targetPlayerId: targetId,
        details: { amount, action: 'admin_override' }
      });
    } catch {
      console.error("Ошибка действия.");
      notify("Событие игры обновлено.", 'error');
    }
  };

  const handleAdminAddCard = async (targetId: string, cardId: string) => {
    if (!isAdmin) return;
    try {
      const targetRef = doc(db, "players", targetId);
      await runTransaction(db, async (transaction) => {
        const targetSnap = await transaction.get(targetRef);
        transaction.update(targetRef, {
          inventory: addOneCardToInventory((targetSnap.data() as Player | undefined)?.inventory, cardId),
        });
      });
      notify("Событие игры обновлено.", 'success');
      logEvent({
        id: `admin_add_card_${Date.now()}`,
        timestamp: Date.now(),
        type: 'card_play',
        message: "Событие игры.",
        playerId: user?.uid || 'admin',
        targetPlayerId: targetId,
        cardId: cardId
      });
    } catch {
      console.error("Ошибка действия.");
      notify("Событие игры обновлено.", 'error');
    }
  };

  const handleAdminRemoveCard = async (targetId: string, cardId: string) => {
    if (!isAdmin) return;
    try {
      const targetRef = doc(db, "players", targetId);
      await runTransaction(db, async (transaction) => {
        const targetSnap = await transaction.get(targetRef);
        transaction.update(targetRef, {
          inventory: removeOneCardFromInventory((targetSnap.data() as Player | undefined)?.inventory, cardId),
        });
      });
      notify("Событие игры обновлено.", 'info');
      logEvent({
        id: `admin_rem_card_${Date.now()}`,
        timestamp: Date.now(),
        type: 'info',
        message: "Событие игры.",
        playerId: user?.uid || 'admin',
        targetPlayerId: targetId,
        cardId: cardId
      });
    } catch {
      console.error("Ошибка действия.");
      notify("Событие игры обновлено.", 'error');
    }
  };
  const handlePrepareTurn = async () => {
    if (!isAdmin) return;
    const hasUnresolvedCustomDuel = Object.values(gameState.activeDuels || {}).some(
      (duel) => duel.status === 'admin_wait'
    );

    if (hasUnresolvedCustomDuel) {
      notify("Событие игры обновлено.", 'warning');
      return;
    }

    const turnState = buildTurnState();
    if (turnState.turnOrder.length === 0) {
      notify("Нет игроков с результатом больше 0. Нельзя начать ход.", 'warning');
      return;
    }

    await updateDoc(doc(db, "gameState", "current"), {
      ...turnState,
      phase: "turn",
    });
  };

  const handleResetGameForTesting = async () => {
    if (!isAdmin) return;

    const playersSnap = await getDocs(collection(db, "players"));
    await Promise.all(
      playersSnap.docs.map((playerDoc) =>
        updateDoc(playerDoc.ref, {
          position: 0,
          prevCell: null,
          inGame: false,
          inventory: [],
          tiltCoins: 0,
          lastTiltoCoins: 0,
          bonusPoints: 0,
          hasProtection: false,
          customStatus: null,
          statusDuration: 0,
          discardNextDrawn: false,
          redirectNextDrawnToPlayerId: null,
          giveNextDrawnToPlayerId: null,
          lastNotification: deleteField(),
          isFrozen: deleteField(),
          freezeDuration: deleteField(),
        }),
      ),
    );

    await setDoc(doc(db, "gameState", "current"), defaultGameState);
    await resetStarterCards();
  };

  return {
    user,
    playerData,
    loading,
    players,
    gameState,
    allCards,
    gameEvents: syncedEvents,
    isAdmin,
    currentTurnPlayerId,
    canRoll,
    notify, // Expose notify
    logEvent, // Expose logEvent
    canConfirmRoll,
    getPlayerById,
    handlers: {
      handleLogout,
      handleUpdateLogin,
      handleUpdateBorderColor,
      chooseStart,
      updateAvatar,
      handleUseCard,
      handleRerollWheel,
      grantPrizeCard,
      handleMoveComplete,
      handleFinishInteraction,
      handleRoll,
      handleConfirmRoll,
      handleStepPhase,
      handlePrepareTurn,
      handleResetGameForTesting,
      handleSelectOpponentCard,
      handleCancelInteraction,
      handleConfirmMoveForCoins, // Add new handler
      handleDuelChallengeResponse, // Add new handler
      handlePlaceDuelBet,
      handleStartDuelRoll,
      handleSelectDuelWeapon,
      handleFinishDuel,
      handleAdminUpdateCoins,
      handleAdminAddCard,
      handleAdminRemoveCard,
    },
  };
}
