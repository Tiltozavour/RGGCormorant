/* eslint-disable react-hooks/purity, @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback, useRef } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import {
  collection,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  updateDoc,
  setDoc,
  arrayUnion,
  increment,
  arrayRemove,
  runTransaction,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { resetStarterCards } from "../types/cardService";
import { gameMap } from "./gameMap";
import type { CardRarity, GameCard, DuelWeapon } from "../types/card";
import { defaultGameState } from "../types/game";
import type { DuelState, GameState, Player } from "../types/game";
import { PHASE_ORDER } from "./gameConstants";

const rollD6 = () => Math.floor(Math.random() * 6) + 1;

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

const clearTemporaryStatus = {
  customStatus: null,
  statusDuration: 0,
};

type GamblingRarity = Exclude<CardRarity, "legendary">;

const GAMBLING_RARITY_WEIGHTS: Array<{ rarity: GamblingRarity; weight: number }> = [
  { rarity: "common", weight: 50 },
  { rarity: "rare", weight: 30 },
  { rarity: "epic", weight: 20 },
];

const GAMBLING_MOMENTAL_WEIGHT = 3;

export function useGameData() {
  const [user, setUser] = useState<User | null>(null);
  const [playerData, setPlayerData] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState>(defaultGameState);
  const [allCards, setAllCards] = useState<Record<string, GameCard>>({});
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
  const isCurrentPlayersTurn = gameState.turnOrder.length === 0 || currentTurnPlayerId === user?.uid;

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
        if (!prizeSnap.exists()) return;

        const prizeData = prizeSnap.data() as GameCard;
        if (prizeData.isUnique && prizeData.isWon) return;

        transaction.update(playerRef, { inventory: arrayUnion(cardId) });
        transaction.update(prizeRef, { isWon: true, winnerId: playerId });
      });
    } catch (e) {
      console.error("Ошибка при выдаче приза:", e);
    }
  };

  const handleUseCard = async (card: GameCard, targetPlayerId?: string) => {
    if (!user || !playerData) return;

    if (!isAdmin) {
      const { phase, currentRoll } = gameState;

      if (phase === "next_game") {
        if (card.action !== "spin_wheel") {
          alert("Эту карту можно использовать только во время хода на поле!");
          return;
        }
      } else if (phase === "turn") {
        const isProtection = card.action === "protection";
        const isExtraRoll = card.action === "extra_roll";
        const isMovement = card.action === "move_steps";

        if (!isProtection) {
          if (!isCurrentPlayersTurn) {
            alert("Сейчас не ваш ход!");
            return;
          }

          if (!isMovement && !isExtraRoll && currentRoll !== null) {
            alert("Вы уже бросили кубик. Обычные карты используются до броска.");
            return;
          }
        }

        if (isExtraRoll && currentRoll === null) {
          alert("Сначала бросьте кубик!");
          return;
        }
      } else {
        alert("Сейчас нельзя использовать карты. Дождитесь нужной фазы игры.");
        return;
      }
    }

    if (card.action === "protection" && playerData.hasProtection) {
      alert("У вас уже активно Силовое поле.");
      return;
    }

    try {
      const playerRef = doc(db, "players", user.uid);
      const targetRef = targetPlayerId ? doc(db, "players", targetPlayerId) : null;
      const targetPlayer = getPlayerById(targetPlayerId);
      const targetHasReflect = targetPlayer?.customStatus === "reflect_debuff";
      const targetHasFish = targetPlayer?.customStatus === "fish_shield";

      await updateDoc(playerRef, { inventory: arrayRemove(card.id) });
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
          alert("Переброс активирован. Бросайте кубик еще раз.");
          break;
        }

        case "add_coins":
          await updateDoc(playerRef, { tiltCoins: increment(card.value) });
          break;

        case "steal_coins":
          if (targetRef && targetPlayerId) {
            if (targetHasFish && card.id === "inv_018") {
              // Проверяем успех броска для Катжита перед срабатыванием Рыбки
              const roll = rollD6();
              if (roll < 4) {
                await updateDoc(playerRef, { tiltCoins: increment(-10) });
                alert(`Кубик: ${roll}. Неудача. Вы потеряли 10 монет.`);
                break;
              }
              await updateDoc(targetRef, clearTemporaryStatus);
              alert(`${targetPlayer?.login} заблокировал кражу монет с помощью Рыбки!`);
              break;
            }
            if (targetHasReflect) {
              await updateDoc(targetRef, clearTemporaryStatus);
              await runTransaction(db, async (transaction) => {
                const mySnap = await transaction.get(playerRef);
                const currentCoins = mySnap.data()?.tiltCoins || 0;
                const amount = Math.min(currentCoins, card.value);
                transaction.update(playerRef, { tiltCoins: increment(-amount) });
                transaction.update(targetRef, { tiltCoins: increment(amount) });
              });
              alert(`${targetPlayer?.login} отразил эффект и забрал ваши монеты.`);
              break;
            }

            if (card.id === "inv_018") {
              const roll = rollD6();
              if (roll >= 4) {
                await runTransaction(db, async (transaction) => {
                  const targetSnap = await transaction.get(targetRef);
                  const amount = Math.min(targetSnap.data()?.tiltCoins || 0, 10);
                  transaction.update(targetRef, { tiltCoins: increment(-amount) });
                  transaction.update(playerRef, { tiltCoins: increment(amount) });
                });
                alert(`Кубик: ${roll}. Удача. Вы украли 10 монет.`);
              } else {
                await updateDoc(playerRef, { tiltCoins: increment(-10) });
                alert(`Кубик: ${roll}. Неудача. Вы потеряли 10 монет.`);
              }
            } else {
              await runTransaction(db, async (transaction) => {
                const targetSnap = await transaction.get(targetRef);
                const currentTargetCoins = targetSnap.data()?.tiltCoins || 0;
                const stealAmount = Math.min(currentTargetCoins, card.value);
                transaction.update(targetRef, { tiltCoins: increment(-stealAmount) });
                transaction.update(playerRef, { tiltCoins: increment(stealAmount) });
              });
            }
          }
          break;

        case "move_steps": {
          const targetId = targetPlayerId || user.uid;
          const isForward = card.value > 0;
          const isHostile = targetId !== user.uid;

          if (isForward && gameState.phase === "turn") {
            // Логика карты "Только вперед!" (inv_007) при использовании на другого игрока
            if (card.id === "inv_007" && isHostile) {
              if (targetHasFish) {
                await updateDoc(targetRef!, clearTemporaryStatus);
                alert(`${targetPlayer?.login} заблокировал перемещение Рыбкой!`);
                break;
              }
              
              await updateDoc(doc(db, "gameState", "current"), {
                forcedMovePlayerId: targetId,
                currentRoll: card.value,
                currentRollPlayerId: user.uid,
                rollConfirmed: false
              });
              
              alert(`Вы управляете перемещением игрока ${targetPlayer?.login} на ${card.value} шага.`);
              break;
            }

            const isMyRollActive = 
              gameState.currentRoll !== null && gameState.currentRollPlayerId === user.uid;

            if (isHostile && targetHasFish) {
              await updateDoc(targetRef!, clearTemporaryStatus);
              alert(`${targetPlayer?.login} заблокировал перемещение Рыбкой!`);
              break;
            }

            if (!isMyRollActive) {
              await updateDoc(doc(db, "gameState", "current"), {
                rollBonus: increment(card.value),
              });
              alert(`К следующему броску добавлено ${card.value} шагов.`);
            } else {
              await updateDoc(doc(db, "gameState", "current"), {
                currentRoll: increment(card.value),
                currentRollPlayerId: targetId,
                rollConfirmed: false,
              });
              alert(`Текущий ход увеличен до ${(gameState.currentRoll || 0) + card.value}.`);
            }
          } else {
            const subjectRef = targetRef || playerRef;
            if (isHostile && targetHasFish) {
              await updateDoc(targetRef!, clearTemporaryStatus);
              alert(`${targetPlayer?.login} заблокировал перемещение Рыбкой!`);
              break;
            }
            const currentPos =
              (targetPlayerId ? getPlayerById(targetPlayerId) : playerData)?.position || 0;
            await updateDoc(subjectRef, {
              position: Math.max(0, currentPos + card.value),
              prevCell: null,
            });
            alert(targetPlayerId ? "Игрок перемещен." : "Вы перемещены.");
          }
          break;
        }

        case "teleport":
          await updateDoc(playerRef, { position: card.value, prevCell: null });
          break;

        case "teleport_to_type": {
          const currentPos = playerData.position ?? 0;
          const reachableBShops: number[] = [];
          const visited = new Set<number>();
          const queue = [...(gameMap.find((c) => c.id === currentPos)?.next || [])];

          while (queue.length > 0) {
            const currId = queue.shift()!;
            if (visited.has(currId)) continue;
            visited.add(currId);

            const cell = gameMap.find((c) => c.id === currId);
            if (!cell) continue;

            if (cell.type === "b-shop" && currId !== currentPos) reachableBShops.push(currId);
            queue.push(...cell.next);
          }

          if (reachableBShops.length > 0) {
            const targetId = pickRandom(reachableBShops);
            if (targetId === null) break;

            await runTransaction(db, async (transaction) => {
              transaction.update(playerRef, { position: targetId, prevCell: null });
              transaction.update(doc(db, "gameState", "current"), {
                activeInteraction: {
                  playerId: user.uid,
                  type: "bshop",
                  cards: getRandomInteractionCards("bshop"),
                },
              });
            });
            alert(`Квантовый прыжок на клетку ${targetId}.`);
          } else {
            alert("Впереди не найдено ни одного B-Shop.");
          }
          break;
        }

        case "spin_wheel":
          await updateDoc(doc(db, "gameState", "current"), { showWheel: true });
          break;

        case "challenge_gaben":
          await updateDoc(playerRef, {
            customStatus: "gaben_challenge",
            statusDuration: 2,
          });
          alert("Испытание Габена принято.");
          break;

        case "protection":
          await updateDoc(playerRef, { hasProtection: true });
          break;

        case "fish_protection":
          if (gameState.showWheel) {
            await updateDoc(doc(db, "gameState", "current"), { showWheel: false });
            alert("Вы отменили прокрутку колеса!");
          } else {
            await updateDoc(playerRef, {
              customStatus: "fish_shield",
              statusDuration: 1,
            });
            alert("No no no mr. Fish активирован. Следующая атака игрока будет заблокирована.");
          }
          break;

        case "prize":
          alert(`Супер-приз: ${card.name}. Свяжитесь с администратором.`);
          break;

        case "judge_coins":
          if (targetRef && targetPlayerId) {
            if (targetHasFish) {
              await updateDoc(targetRef, clearTemporaryStatus);
              alert(`${targetPlayer?.login} заблокировал эффект судьи Рыбкой!`);
              break;
            }
            const targetDoc = targetHasReflect ? playerRef : targetRef;
            const targetLabel = targetHasReflect ? "Вы" : targetPlayer?.login || "Игрок";
            if (targetHasReflect) {
              await updateDoc(targetRef, clearTemporaryStatus);
            }
            const roll = rollD6();
            const delta = roll >= 4 ? card.value : -card.value;
            await updateDoc(targetDoc, { tiltCoins: increment(delta) });
            alert(`${targetLabel} ${delta >= 0 ? "получает" : "теряет"} ${Math.abs(delta)} монет. Кубик: ${roll}.`);
          }
          break;

        case "deal_with_mage": {
          const roll = rollD6();
          if (roll === 1) {
            await updateDoc(doc(db, "gameState", "current"), {
              activeInteraction: {
                playerId: user.uid,
                type: "gambling",
                cards: getRandomInteractionCards("gambling"),
              },
            });
            alert(`Кубик: ${roll}. Вы прокляты и сразу тянете gambling-карту.`);
          } else if (roll <= 4) {
            await updateDoc(playerRef, { tiltCoins: increment(card.value) });
            await updateDoc(doc(db, "gameState", "current"), {
              activeInteraction: {
                playerId: user.uid,
                type: "gambling",
                cards: getRandomInteractionCards("gambling"),
              },
            });
            alert(`Кубик: ${roll}. Вы получили ${card.value} монет и тянете gambling-карту.`);
          } else {
            await updateDoc(playerRef, { tiltCoins: increment(card.value) });
            alert(`Кубик: ${roll}. Вы получили ${card.value} монет.`);
          }
          break;
        }

        case "discard_card":
          if (targetRef && targetPlayerId) {
            if (targetHasFish) {
              await updateDoc(targetRef, clearTemporaryStatus);
              alert(`${targetPlayer?.login} заблокировал сброс карты Рыбкой!`);
              break;
            }

            const victimId = targetHasReflect ? user.uid : targetPlayerId;
            const victim = getPlayerById(victimId);

            if (!victim || !victim.inventory || victim.inventory.length === 0) {
              alert("У игрока нет карт для сброса.");
              break;
            }

            if (targetHasReflect) {
              await updateDoc(targetRef, clearTemporaryStatus);
            }

            // Вместо случайного удаления, открываем режим выбора карты
            await updateDoc(doc(db, "gameState", "current"), {
              activeInteraction: {
                playerId: user.uid,
                type: "discard_selection",
                targetPlayerId: victimId,
                // Перемешиваем карты перед показом игроку
                cards: shuffle(victim.inventory),
                actingCardId: card.id,
              }
            });
            if (targetHasReflect) alert("Эффект отражен! Вы должны выбрать карту из своего инвентаря для сброса.");
          }
          break;

        case "steal_card":
          if (targetRef && targetPlayerId) {
            if (targetHasFish) {
              await updateDoc(targetRef, clearTemporaryStatus);
              alert(`${targetPlayer?.login} заблокировал кражу карты Рыбкой!`);
              break;
            }

            const victimId = targetHasReflect ? user.uid : targetPlayerId;
            const victim = getPlayerById(victimId);
            const recipientId = targetHasReflect ? targetPlayerId : user.uid;

            if (!victim || !victim.inventory || victim.inventory.length === 0) {
              alert("У игрока нет карт для кражи.");
              break;
            }

            if (targetHasReflect) {
              await updateDoc(targetRef, clearTemporaryStatus);
            }

            // Открываем режим выбора карты (теперь идентично discard_card)
            await updateDoc(doc(db, "gameState", "current"), {
              activeInteraction: {
                playerId: user.uid,
                type: "discard_selection",
                targetPlayerId: victimId,
                recipientId: recipientId,
                // Перемешиваем карты перед показом игроку
                cards: shuffle(victim.inventory),
                actingCardId: card.id,
              }
            });
            if (targetHasReflect) alert("Эффект отражен! Вы выбираете карту у себя (и отдаете её сопернику).");
          }
          break;

        case "reflect_debuff":
          await updateDoc(playerRef, {
            customStatus: "reflect_debuff",
            statusDuration: 1,
          });
          alert("Следующий направленный дебафф будет отражен.");
          break;

        case "move_target_for_coins": {
          if (!targetRef || !targetPlayerId) {
            alert("Необходимо выбрать цель для перемещения.");
            break;
          }

            if (targetHasFish) {
              await updateDoc(targetRef, clearTemporaryStatus);
              alert(`${targetPlayer?.login} заблокировал перемещение Рыбкой!`);
              break;
            }
            const steps = Math.min(playerData.tiltCoins ?? 0, 3);
            if (steps <= 0) {
              // This alert will be handled by AppClean.tsx
              // alert("У вас нет монет для этой карты.");
              await updateDoc(playerRef, { inventory: arrayUnion(card.id) }); // Return card if no coins
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
            break;
        }

        case "discard_next_drawn":
          await updateDoc(playerRef, { discardNextDrawn: true });
          alert("Следующая полученная карта будет сброшена.");
          break;

        case "duel": {
          if (!targetRef || !targetPlayerId || !targetPlayer) {
            alert("Необходимо выбрать цель для дуэли.");
            break;
          }

          const duelChallengerId = user.uid;
          const duelTargetId = targetPlayerId;
          const duelCardId = card.id; // inv_015

          const targetHasFishProtection = targetPlayer.inventory?.includes("inv_006");

          // Генерируем уникальный ID для дуэли
          const newDuelId = `duel_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

          const initialDuelState: DuelState = {
            id: newDuelId,
            challengerId: duelChallengerId,
            targetId: duelTargetId,
            status: 'pending', // Дуэль ожидает ответа цели или выбора оружия
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

          if (targetHasFishProtection) {
            // Создаем интеракцию для цели, чтобы она ответила на вызов дуэли
            await updateDoc(doc(db, "gameState", "current"), {
              [`activeDuels.${newDuelId}`]: initialDuelState, // Добавляем новую дуэль в activeDuels
              activeInteraction: {
                playerId: duelTargetId, // Целевой игрок должен ответить
                type: "duel_challenge_response",
                duelId: newDuelId,
                cards: targetPlayer.inventory?.filter(id => id === "inv_006") || [], // Только inv_006 актуальна здесь
                actingCardId: duelCardId, // Карта дуэли (inv_015)
                targetPlayerId: duelChallengerId, // Вызывающий - цель ответа
              }
            });

            // Уведомляем вызывающего, что цель отвечает
            await updateDoc(playerRef, {
              lastNotification: {
                message: `Вы вызвали ${targetPlayer.login} на дуэль. Ожидаем его ответа.`,
                timestamp: Date.now(),
                cardId: duelCardId
              }
            });
            // Уведомляем цель через общий gameState, не записывая в чужой players-документ.
            await updateDoc(doc(db, "gameState", "current"), {
              [`notifications.${duelTargetId}`]: {
                message: `Вас вызвали на дуэль! Подготовьтесь отстоять свою честь. (Карты, позволяющие избежать дуэль: inv_006)`,
                timestamp: Date.now(),
                cardId: duelCardId
              }
            });

          } else {
            // Нет защиты от рыбы, или у цели ее нет, переходим сразу к выбору оружия
            // Обновляем статус дуэли на accepted и создаем интеракцию выбора оружия
            await updateDoc(doc(db, "gameState", "current"), {
              [`activeDuels.${newDuelId}`]: { ...initialDuelState, status: 'accepted' }, // Дуэль принята, переходим к выбору оружия
              activeInteraction: {
                playerId: duelTargetId, // Цель выбирает оружие первой
                type: "duel_weapon_selection",
                duelId: newDuelId,
                cards: [], // Карты не участвуют в выборе оружия напрямую
                targetPlayerId: duelTargetId,
                actingCardId: duelCardId,
              }
            });

            // Уведомляем обоих игроков
            await updateDoc(playerRef, {
              lastNotification: {
                message: `Дуэль с ${targetPlayer.login} началась! Выберите оружие.`,
                timestamp: Date.now(),
                cardId: duelCardId
              }
            });
            await updateDoc(doc(db, "gameState", "current"), {
              [`notifications.${duelTargetId}`]: {
                message: `${playerData.login} вызвал вас на дуэль! Выберите оружие.`,
                timestamp: Date.now(),
                cardId: duelCardId
              }
            });
          }
          break;
        }

        case "move_target_and_self":
          if (targetRef && targetPlayerId) {
            if (targetHasFish) {
              await updateDoc(targetRef, clearTemporaryStatus);
              alert(`${targetPlayer?.login} заблокировал эффект Рыбкой!`);
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
            alert("Цель продвинута на 2 клетки, вы отступили на 1.");
          }
          break;

        case "pay_or_move_back":
          if (targetRef && targetPlayerId) {
            if (targetHasFish) {
              await updateDoc(targetRef, clearTemporaryStatus);
              alert(`${targetPlayer?.login} заблокировал налоги Рыбкой!`);
              break;
            }
            const actualTargetId = targetHasReflect ? user.uid : targetPlayerId;
            const actualTargetRef = doc(db, "players", actualTargetId);
            const actualTarget = getPlayerById(actualTargetId) ?? playerData;

            if (targetHasReflect) {
              await updateDoc(targetRef, clearTemporaryStatus);
            }

            const currentCoins = actualTarget?.tiltCoins ?? 0;
            if (currentCoins >= card.value) {
              await updateDoc(actualTargetRef, { tiltCoins: increment(-card.value) });
              alert(`Игрок заплатил ${card.value} монет.`);
            } else {
              await updateDoc(actualTargetRef, {
                position: Math.max(0, (actualTarget?.position ?? 0) - card.value),
                prevCell: null,
              });
              alert(`Игрок отступил на ${card.value} клеток.`);
            }
          }
          break;

        case "take_next_card": {
          const nextPlayerId = getNextPlayerId(user.uid);
          if (!nextPlayerId) {
            alert("Некому перенаправить следующую карту.");
            break;
          }
          await updateDoc(doc(db, "players", nextPlayerId), {
            redirectNextDrawnToPlayerId: user.uid,
          });
          alert("Следующая карта следующего игрока уйдет вам.");
          break;
        }

        case "give_next_card": {
          const nextPlayerId = getNextPlayerId(user.uid);
          if (!nextPlayerId) {
            alert("Некому отдать следующую карту.");
            break;
          }
          await updateDoc(playerRef, { giveNextDrawnToPlayerId: nextPlayerId });
          alert("Следующая ваша полученная карта уйдет другому игроку.");
          break;
        }

        default:
          console.warn("Действие карты не распознано:", card.action);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const getRandomInteractionCards = useCallback(
    (type: "gambling" | "bshop"): string[] => {
      const cardsArray = Object.values(allCards);
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

  const handleSelectOpponentCard = async (targetPlayerId: string, cardId: string) => {
    if (!user || !playerData) return;

    console.log("Запуск handleSelectOpponentCard для:", targetPlayerId, "Карта:", cardId);
    const targetRef = doc(db, "players", targetPlayerId);
    const cardName = allCards[cardId]?.name || "Неизвестная карта";

    try {
      await runTransaction(db, async (transaction) => {
        const gsRef = doc(db, "gameState", "current");
        const gsSnap = await transaction.get(gsRef);
        if (!gsSnap.exists()) return;

        const interaction = (gsSnap.data() as GameState).activeInteraction;
        const isSteal = interaction?.actingCardId === "inv_011";
        const recipientId = interaction?.recipientId;

        // 1. Удаляем карту у цели
        transaction.update(targetRef, {
          inventory: arrayRemove(cardId),
          // Добавляем уведомление, которое UI на стороне цели может отловить
          lastNotification: {
            message: isSteal 
              ? `Игрок "${playerData.login}" украл у вас карту "${cardName}"`
              : `Игрок "${playerData.login}" выбрасывает из вашего инвентаря карту "${cardName}"`,
            timestamp: Date.now(),
            cardId: cardId
          }
        });

        // 2. Если это кража (11 карта), добавляем карту получателю
        if (isSteal && recipientId) {
          const recipientRef = doc(db, "players", recipientId);
          transaction.update(recipientRef, {
            inventory: arrayUnion(cardId)
          });
        }

        // 3. Закрываем интерактив выбора
        transaction.update(gsRef, {
          activeInteraction: null
        });

        // 4. Добавляем в историю разыгранных карт
        transaction.update(gsRef, {
          revealedCards: arrayUnion(cardId)
        });
      });
    } catch (e) {
      console.error("Ошибка при удалении карты соперника:", e);
      alert("Не удалось удалить карту. Проверьте права доступа в консоли Firebase.");
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
          throw new Error("У вас недостаточно монет для оплаты перемещения.");
        }

        // Deduct coins from the card user
        transaction.update(playerRef, { tiltCoins: increment(-steps) });
        // Remove the card from the card user's inventory
        transaction.update(playerRef, { inventory: arrayRemove(card.id) });
        // Add the card to revealed cards
        transaction.update(gameStateRef, { revealedCards: arrayUnion(card.id) });

        const timestamp = Date.now();

        transaction.update(playerRef, {
          lastNotification: {
            message: `Вы управляете фишкой игрока "${getPlayerById(targetPlayerId)?.login ?? "игрок"}" на ${steps} шаг(ов) картой "${card.name}".`,
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
    } catch (e: any) {
      console.error("Ошибка при подтверждении перемещения за монеты:", e);
      alert(e.message || "Произошла ошибка при оплате перемещения.");
    }
  };

  const handleCancelInteraction = async () => {
    if (!user || !gameState.activeInteraction) return;

    const { actingCardId } = gameState.activeInteraction;
    const playerRef = doc(db, "players", user.uid);
    const gsRef = doc(db, "gameState", "current");

    try {
      await runTransaction(db, async (transaction) => {
        // 1. Возвращаем карту игроку, если это была discard_selection, steal_card, or move_for_coins_selection
        if (actingCardId) {
          transaction.update(playerRef, { inventory: arrayUnion(actingCardId) });
          transaction.update(gsRef, { revealedCards: arrayRemove(actingCardId) });
        }
        // 2. Закрываем окно взаимодействия
        transaction.update(gsRef, { activeInteraction: null });
      });
    } catch (e) {
      console.error("Ошибка при отмене действия:", e);
    }
  };

  const handleDuelChallengeResponse = async (duelId: string, response: 'accept' | 'use_protection') => {
    if (!user || !playerData) return;

    const gameStateRef = doc(db, "gameState", "current");
    const playerRef = doc(db, "players", user.uid); // Целевой игрок (отвечающий на вызов)
    const duelState = gameState.activeDuels[duelId];

    if (!duelState || duelState.targetId !== user.uid) {
      console.error("Неверная дуэль или игрок не является целью.");
      return;
    }

    const challengerPlayer = getPlayerById(duelState.challengerId);
    const duelCard = allCards[gameState.activeInteraction?.actingCardId || '']; // inv_015

    try {
      await runTransaction(db, async (transaction) => {
        const currentGameState = (await transaction.get(gameStateRef)).data() as GameState;
        const currentDuelState = currentGameState.activeDuels[duelId];

        if (!currentDuelState) {
          throw new Error("Дуэль не найдена в активных дуэлях.");
        }

        const responseTimestamp = Date.now();

        if (response === 'use_protection') {
          // Цель использует inv_006
          const protectionCardId = "inv_006";
          if (!playerData.inventory?.includes(protectionCardId)) {
            throw new Error("У игрока нет inv_006 для использования.");
          }

          // Удаляем inv_006 из инвентаря цели
          transaction.update(playerRef, { inventory: arrayRemove(protectionCardId) });
          // Добавляем inv_006 в раскрытые карты
          transaction.update(gameStateRef, { revealedCards: arrayUnion(protectionCardId) });

          // Удаляем дуэль из activeDuels
          const updatedActiveDuels = { ...currentGameState.activeDuels };
          delete updatedActiveDuels[duelId];
          transaction.update(gameStateRef, { activeDuels: updatedActiveDuels });

          // Очищаем активное взаимодействие
          transaction.update(gameStateRef, { activeInteraction: null });

          // Уведомляем обоих игроков
          transaction.update(playerRef, {
            lastNotification: {
              message: `Вы успешно избежали дуэли, использовав карту "No, no, no mr. Fish"!`,
              timestamp: responseTimestamp,
              cardId: protectionCardId
            }
          });
          transaction.update(gameStateRef, {
            [`notifications.${currentDuelState.challengerId}`]: {
              message: `${playerData.login} избежал дуэли, использовав карту "No, no, no mr. Fish"! Ваша карта "Дуэль" сгорела.`,
              timestamp: responseTimestamp,
              cardId: duelCard?.id
            }
          });
        } else { // response === 'accept'
          // Цель принимает, переходим к выбору оружия
          transaction.update(gameStateRef, {
            [`activeDuels.${duelId}.status`]: 'accepted',
            activeInteraction: {
              playerId: currentDuelState.targetId, // Цель выбирает оружие первой
              type: "duel_weapon_selection",
              duelId: duelId,
              cards: [],
              targetPlayerId: currentDuelState.targetId,
              actingCardId: duelCard?.id,
            },
            [`notifications.${currentDuelState.challengerId}`]: {
              message: `${playerData.login} принял ваш вызов на дуэль! Выберите оружие.`,
              timestamp: responseTimestamp,
              cardId: duelCard?.id
            },
          });

          // Уведомляем обоих игроков
          transaction.update(playerRef, {
            lastNotification: {
              message: `Вы приняли вызов на дуэль от ${challengerPlayer?.login}! Ожидайте выбора оружия.`,
              timestamp: responseTimestamp,
              cardId: duelCard?.id
            }
          });
        }
      });
    } catch (e: any) {
      console.error("Ошибка при ответе на вызов дуэли:", e);
      alert(e.message || "Произошла ошибка при ответе на дуэль.");
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
        const player = pSnap.data() as Player;
        const duel = gs.activeDuels?.[duelId];

        if (!duel) throw new Error("Дуэль не найдена.");
        if (duel.status !== 'betting') throw new Error("Дуэль не находится на этапе ставок.");
        if (player.tiltCoins === undefined || player.tiltCoins < betAmount) {
          throw new Error("Недостаточно тильтокоинов для ставки.");
        }

        // Deduct bet from player's coins
        transaction.update(playerRef, { tiltCoins: increment(-betAmount) });

        // Update duel state with bet and ready status
        const updatedBets = { ...duel.bets, [user.uid]: betAmount };
        const updatedIsReady = { ...duel.isReady, [user.uid]: true };

        transaction.update(gameStateRef, {
          [`activeDuels.${duelId}.bets`]: updatedBets,
          [`activeDuels.${duelId}.isReady`]: updatedIsReady,
        });

        // Check if both players are ready
        const allPlayersReady = Object.values(updatedIsReady).every(ready => ready === true);
        if (allPlayersReady) {
          // Transition to ready_to_roll phase
          transaction.update(gameStateRef, {
            [`activeDuels.${duelId}.status`]: 'ready_to_roll',
            activeInteraction: {
              playerId: duel.challengerId, // Challenger starts the roll
              type: 'duel_ready_to_roll',
              duelId: duelId,
              targetPlayerId: duel.targetId,
              actingCardId: gs.activeInteraction?.actingCardId,
            },
          });
        } else {
          // If not all ready, switch activeInteraction to the other player for their bet
          const otherPlayerId = duel.challengerId === user.uid ? duel.targetId : duel.challengerId;
          transaction.update(gameStateRef, {
            activeInteraction: {
              playerId: otherPlayerId,
              type: 'duel_betting',
              duelId: duelId,
              targetPlayerId: duel.challengerId === user.uid ? duel.targetId : duel.challengerId, // The other player
              actingCardId: gs.activeInteraction?.actingCardId,
            },
            [`notifications.${otherPlayerId}`]: {
              message: `${player.login} сделал ставку в дуэли. Теперь ваш ход!`,
              timestamp: Date.now(),
            }
          });
        }
      });
    } catch (e: any) {
      console.error("Ошибка при размещении ставки в дуэли:", e);
      alert(e.message || "Произошла ошибка при размещении ставки.");
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

        if (!duel) throw new Error("Дуэль не найдена.");
        if (duel.status !== 'ready_to_roll') throw new Error("Дуэль не готова к броску.");
        if (duel.challengerId !== user.uid) throw new Error("Только инициатор дуэли может начать бросок.");

        transaction.update(gameStateRef, {
          [`activeDuels.${duelId}.status`]: 'rolling',
          activeInteraction: null, // Clear interaction, animation will take over
        });
      });
    } catch (e) {
      console.error("Ошибка при начале броска дуэли:", e);
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

        if (!duel) throw new Error("Дуэль не найдена.");

        // Обновляем оружие в стейте дуэли и переходим к этапу ставок
        transaction.update(gameStateRef, {
          [`activeDuels.${duelId}.weapon`]: weapon,
          [`activeDuels.${duelId}.status`]: 'betting', // Переходим к этапу ставок
          // Переключаем активное взаимодействие на вызывающего игрока для начала этапа ставок
          activeInteraction: {
            playerId: duel.challengerId,
            actingCardId: gs.activeInteraction?.actingCardId, // Сохраняем ID карты дуэли
            type: 'duel_betting',
            duelId: duelId,
            targetPlayerId: duel.targetId
          }
        });
      });
    } catch (e) {
      console.error("Ошибка при выборе оружия дуэли:", e);
    }
  };

  const handleFinishDuel = async (duelId: string) => {
    if (!user || !playerData) return;

    const gameStateRef = doc(db, "gameState", "current");

    try {
      await runTransaction(db, async (transaction) => {
        const gsSnap = await transaction.get(gameStateRef);
        if (!gsSnap.exists()) return;

        const gs = gsSnap.data() as GameState;
        const duel = gs.activeDuels?.[duelId];

        if (!duel) throw new Error("Дуэль не найдена.");
        if (duel.status === 'finished') return;

        // Определение победителя по кубикам
        const challengerRoll = rollD6();
        const targetRoll = rollD6();
        
        let winnerId: string | 'draw' = 'draw';
        if (challengerRoll > targetRoll) {
          winnerId = duel.challengerId;
        } else if (targetRoll > challengerRoll) {
          winnerId = duel.targetId;
        }

        const challengerBet = duel.bets[duel.challengerId] || 0;
        const targetBet = duel.bets[duel.targetId] || 0;
        const totalPot = challengerBet + targetBet;

        // Распределение выигрыша (предполагается, что ставки были списаны ранее при betting)
        if (winnerId !== 'draw') {
          const winnerRef = doc(db, "players", winnerId);
          transaction.update(winnerRef, {
            tiltCoins: increment(totalPot)
          });
        } else {
          // При ничьей возвращаем исходные ставки участникам
          transaction.update(doc(db, "players", duel.challengerId), {
            tiltCoins: increment(challengerBet)
          });
          transaction.update(doc(db, "players", duel.targetId), {
            tiltCoins: increment(targetBet)
          });
        }

        const timestamp = Date.now();
        // Обновляем состояние дуэли и рассылаем уведомления участникам
        const updatePayload: any = {
          [`activeDuels.${duelId}.status`]: 'finished',
          [`activeDuels.${duelId}.winnerId`]: winnerId,
          activeInteraction: null, // Закрываем модальное окно для игрока
          [`notifications.${duel.challengerId}`]: {
            message: winnerId === 'draw' 
              ? `Дуэль: ничья (${challengerRoll} vs ${targetRoll}). Ставка возвращена.`
              : winnerId === duel.challengerId 
                ? `Победа! Вы выиграли дуэль (${challengerRoll} vs ${targetRoll}) и получили ${totalPot} 🦖`
                : `Поражение. Вы проиграли дуэль (${challengerRoll} vs ${targetRoll}).`,
            timestamp,
          },
          [`notifications.${duel.targetId}`]: {
            message: winnerId === 'draw' 
              ? `Дуэль: ничья (${targetRoll} vs ${challengerRoll}). Ставка возвращена.`
              : winnerId === duel.targetId 
                ? `Победа! Вы выиграли дуэль (${targetRoll} vs ${challengerRoll}) и получили ${totalPot} 🦖`
                : `Поражение. Вы проиграли дуэль (${targetRoll} vs ${challengerRoll}).`,
            timestamp,
          }
        };

        transaction.update(gameStateRef, updatePayload);
      });
    } catch (e) {
      console.error("Ошибка при завершении дуэли:", e);
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
          return;
        }

        if (isCardMove) {
          transaction.update(gameStateRef, {
            forcedMovePlayerId: null,
            cardMove: null,
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
    [user, getRandomInteractionCards],
  );

  const handleFinishInteraction = async (
    cardId?: string,
    cost: number = 0,
    skipWithCardId?: string
  ) => {
    if (!user || !gameState.activeInteraction) return;

    const playerRef = doc(db, "players", user.uid);
    const gameStateRef = doc(db, "gameState", "current");

    try {
      await runTransaction(db, async (transaction) => {
        const gsSnap = await transaction.get(gameStateRef);
        const pSnap = await transaction.get(playerRef);
        if (!gsSnap.exists() || !pSnap.exists()) return;

        const { turnOrder = [], currentTurnIndex = 0, activeInteraction } = gsSnap.data() as GameState;
        const player = pSnap.data() as Player;

        if (skipWithCardId) {
          transaction.update(playerRef, { inventory: arrayRemove(skipWithCardId) });
          transaction.update(gameStateRef, { revealedCards: arrayUnion(skipWithCardId) });
        } else if (cardId) {
          const card = allCards[cardId];
          if (card.deck === "inventory") {
            if (cost > 0) {
              transaction.update(playerRef, { tiltCoins: increment(-cost) });
            }

            let suppressCard = false;
            let finalRecipientRef = playerRef;

            if (player.discardNextDrawn) {
              suppressCard = true;
              transaction.update(playerRef, { discardNextDrawn: false });
            } else if (player.redirectNextDrawnToPlayerId) {
              finalRecipientRef = doc(db, "players", player.redirectNextDrawnToPlayerId);
              transaction.update(playerRef, { redirectNextDrawnToPlayerId: null });
            } else if (player.giveNextDrawnToPlayerId) {
              finalRecipientRef = doc(db, "players", player.giveNextDrawnToPlayerId);
              transaction.update(playerRef, { giveNextDrawnToPlayerId: null });
            }

            if (!suppressCard) {
              transaction.update(finalRecipientRef, { inventory: arrayUnion(card.id) });
            }
          } else {
            const isNegative =
              (card.action === "add_coins" && card.value < 0) ||
              (card.action === "move_steps" && card.value < 0) ||
              card.action === "skip_turn" ||
              (card.action === "teleport" && card.value === 0);

            if (isNegative && player.hasProtection && activeInteraction?.type === "gambling") {
              transaction.update(playerRef, { hasProtection: false });
            } else {
              if (card.action === "add_coins") {
                transaction.update(playerRef, { tiltCoins: increment(card.value) });
              } else if (card.action === "move_steps") {
                const currentPos = player.position || 0;
                transaction.update(playerRef, {
                  position: Math.max(0, currentPos + card.value),
                  prevCell: null,
                });
              } else if (card.action === "teleport") {
                transaction.update(playerRef, { position: card.value, prevCell: null });
              } else if (card.action === "challenge_gaben") {
                transaction.update(playerRef, {
                  customStatus: "gaben_challenge",
                  statusDuration: 2,
                });
              } else if (card.action === "take_next_card") {
                const nextPlayerId = getNextPlayerId(user.uid);
                if (nextPlayerId) {
                  transaction.update(doc(db, "players", nextPlayerId), {
                    redirectNextDrawnToPlayerId: user.uid,
                  });
                }
              } else if (card.action === "give_next_card") {
                const nextPlayerId = getNextPlayerId(user.uid);
                if (nextPlayerId) {
                  transaction.update(playerRef, { giveNextDrawnToPlayerId: nextPlayerId });
                }
              }
            }
          }

          transaction.update(gameStateRef, { revealedCards: arrayUnion(cardId) });
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
  };

  const handleConfirmRoll = async () => {
    if (!user || !canConfirmRoll) return;
    await updateDoc(doc(db, "gameState", "current"), { rollConfirmed: true });
  };

  const buildTurnState = () => {
    const activePlayers = players.filter((player) => player.inGame && player.role !== "admin");
    const sortedIds = [...activePlayers]
      .sort((a, b) => {
        const scoreA = a.tiltCoins ?? 0;
        const scoreB = b.tiltCoins ?? 0;
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
    const payload: Partial<GameState> = { phase: nextPhase, round: nextRound };

    if (nextPhase === "turn") {
      Object.assign(payload, buildTurnState());
    } else {
      payload.currentRoll = null;
      payload.currentRollPlayerId = null;
      payload.lastBaseRoll = null;
      payload.rollBonus = 0;
      payload.rollConfirmed = false;
    }

    await updateDoc(doc(db, "gameState", "current"), payload);
  };

  const handlePrepareTurn = async () => {
    if (!isAdmin) return;
    await updateDoc(doc(db, "gameState", "current"), {
      ...buildTurnState(),
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
    isAdmin,
    currentTurnPlayerId,
    canRoll,
    canConfirmRoll,
    getPlayerById,
    handlers: {
      handleLogout,
      handleUpdateLogin,
      handleUpdateBorderColor,
      chooseStart,
      updateAvatar,
      handleUseCard,
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
    },
  };
}
