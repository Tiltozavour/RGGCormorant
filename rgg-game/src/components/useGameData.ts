import { useState, useEffect, useCallback } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  setDoc,
  arrayUnion,
  increment,
  arrayRemove,
  runTransaction,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { gameMap } from "./gameMap";
import type { GameCard } from "../types/card";
import { defaultGameState } from "../types/game";
import type { GameState, Player } from "../types/game";
import { PHASE_ORDER } from "./gameConstants";

const rollD6 = () => Math.floor(Math.random() * 6) + 1;

const pickRandom = <T,>(items: T[]): T | null => {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
};

const clearTemporaryStatus = {
  customStatus: null,
  statusDuration: 0,
};

export function useGameData() {
  const [user, setUser] = useState<User | null>(null);
  const [playerData, setPlayerData] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState>(defaultGameState);
  const [allCards, setAllCards] = useState<Record<string, GameCard>>({});

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
    gameState.currentRoll === null &&
    !playerData?.isFrozen;

  const canConfirmRoll =
    !isAdmin &&
    !!playerData?.inGame &&
    isCurrentPlayersTurn &&
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

        case "freeze_player":
          if (targetRef && targetPlayerId) {
            if (targetHasFish) {
              await updateDoc(targetRef, clearTemporaryStatus);
              alert(`${targetPlayer?.login} заблокировал заморозку Рыбкой!`);
              break;
            }
            if (targetHasReflect) {
              await updateDoc(targetRef, clearTemporaryStatus);
              await updateDoc(playerRef, {
                isFrozen: true,
                freezeDuration: card.value || 1,
              });
              alert(`${targetPlayer?.login} отразил заморозку.`);
            } else {
              await updateDoc(targetRef, {
                isFrozen: true,
                freezeDuration: card.value || 1,
              });
              alert("Игрок заморожен.");
            }
          }
          break;

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
            const victimRef = doc(db, "players", victimId);
            if (targetHasReflect) {
              await updateDoc(targetRef, clearTemporaryStatus);
            }

            await runTransaction(db, async (transaction) => {
              const victimSnap = await transaction.get(victimRef);
              const inventory = (victimSnap.data()?.inventory as string[] | undefined) ?? [];
              const cardToDiscard = pickRandom(inventory);
              if (!cardToDiscard) return;
              transaction.update(victimRef, { inventory: arrayRemove(cardToDiscard) });
            });
            alert(targetHasReflect ? "Вашу карту сбросили отражением." : "Карта цели сброшена.");
          }
          break;

        case "steal_card":
          if (targetRef && targetPlayerId) {
            if (targetHasFish) {
              await updateDoc(targetRef, clearTemporaryStatus);
              alert(`${targetPlayer?.login} заблокировал кражу карты Рыбкой!`);
              break;
            }
            const fromId = targetHasReflect ? user.uid : targetPlayerId;
            const toId = targetHasReflect ? targetPlayerId : user.uid;
            const fromRef = doc(db, "players", fromId);
            const toRef = doc(db, "players", toId);

            if (targetHasReflect) {
              await updateDoc(targetRef, clearTemporaryStatus);
            }

            await runTransaction(db, async (transaction) => {
              const fromSnap = await transaction.get(fromRef);
              const inventory = (fromSnap.data()?.inventory as string[] | undefined) ?? [];
              const stolenCard = pickRandom(inventory);
              if (!stolenCard) return;

              transaction.update(fromRef, { inventory: arrayRemove(stolenCard) });
              transaction.update(toRef, { inventory: arrayUnion(stolenCard) });
            });
            alert(targetHasReflect ? "Отражение сработало: карту украли у вас." : "Вы украли карту.");
          }
          break;

        case "reflect_debuff":
          await updateDoc(playerRef, {
            customStatus: "reflect_debuff",
            statusDuration: 1,
          });
          alert("Следующий направленный дебафф будет отражен.");
          break;

        case "move_target_for_coins":
          if (targetRef && targetPlayerId) {
            if (targetHasFish) {
              await updateDoc(targetRef, clearTemporaryStatus);
              alert(`${targetPlayer?.login} заблокировал перемещение Рыбкой!`);
              break;
            }
            const steps = Math.min(playerData.tiltCoins ?? 0, 3);
            if (steps <= 0) {
              alert("У вас нет монет для этой карты.");
              break;
            }
            const actualTargetId = targetHasReflect ? user.uid : targetPlayerId;
            const actualTargetRef = doc(db, "players", actualTargetId);
            const actualTarget = getPlayerById(actualTargetId);

            if (targetHasReflect) {
              await updateDoc(targetRef, clearTemporaryStatus);
            }

            await updateDoc(playerRef, { tiltCoins: increment(-steps) });
            await updateDoc(actualTargetRef, {
              position: (actualTarget?.position ?? 0) + steps,
              prevCell: null,
            });
            alert(`Оплачено ${steps} монет за перемещение на ${steps} клеток.`);
          }
          break;

        case "discard_next_drawn":
          await updateDoc(playerRef, { discardNextDrawn: true });
          alert("Следующая полученная карта будет сброшена.");
          break;

        case "duel":
          if (targetRef && targetPlayerId) {
            if (targetHasFish) {
              await updateDoc(targetRef, clearTemporaryStatus);
              alert(`${targetPlayer?.login} заблокировал дуэль Рыбкой!`);
              break;
            }
            const targetCoins = targetPlayer?.tiltCoins ?? 0;
            const myCoins = playerData.tiltCoins ?? 0;
            const stake = Math.min(5, myCoins, targetCoins);
            if (stake <= 0) {
              alert("Для дуэли у одного из игроков недостаточно монет.");
              break;
            }

            const myRoll = rollD6();
            const enemyRoll = rollD6();

            if (myRoll === enemyRoll) {
              alert(`Ничья в дуэли: ${myRoll}:${enemyRoll}. Монеты остаются у игроков.`);
            } else if (myRoll > enemyRoll) {
              await updateDoc(playerRef, { tiltCoins: increment(stake) });
              await updateDoc(targetRef, { tiltCoins: increment(-stake) });
              alert(`Вы победили в дуэли ${myRoll}:${enemyRoll} и забрали ${stake} монет.`);
            } else {
              await updateDoc(playerRef, { tiltCoins: increment(-stake) });
              await updateDoc(targetRef, { tiltCoins: increment(stake) });
              alert(`Вы проиграли дуэль ${myRoll}:${enemyRoll} и потеряли ${stake} монет.`);
            }
          }
          break;

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
          const rand = Math.random();
          const pool =
            rand < 0.02
              ? cardsArray.filter((card) => card.rarity === "legendary")
              : rand < 0.35
                ? cardsArray.filter(
                    (card) => card.deck === "inventory" && card.rarity !== "legendary",
                  )
                : cardsArray.filter((card) => card.deck === "momental");
          const selected = pickRandom(pool);
          if (selected) result.push(selected.id);
        }
      }

      return result;
    },
    [allCards],
  );

  const handleMoveComplete = useCallback(
    async (position: number, prevCell: number | null, cellType?: string) => {
      if (!user) return;
      const playerRef = doc(db, "players", user.uid);
      const gameStateRef = doc(db, "gameState", "current");

      await runTransaction(db, async (transaction) => {
        const gsSnap = await transaction.get(gameStateRef);
        if (!gsSnap.exists()) return;
        const { turnOrder = [], currentTurnIndex = 0 } = gsSnap.data() as GameState;
        transaction.update(playerRef, { position, prevCell });

        if (cellType === "gambling" || cellType === "bshop") {
          transaction.update(gameStateRef, {
            activeInteraction: {
              playerId: user.uid,
              type: cellType,
              cards: getRandomInteractionCards(cellType),
            },
          });
          return;
        }

        const isLast = currentTurnIndex === turnOrder.length - 1;
        transaction.update(gameStateRef, {
          phase: isLast ? "next_game" : "turn",
          currentTurnIndex: isLast ? 0 : currentTurnIndex + 1,
          currentRoll: null,
          currentRollPlayerId: null,
          rollConfirmed: false,
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
              } else if (card.action === "skip_turn") {
                transaction.update(playerRef, {
                  isFrozen: true,
                  freezeDuration: card.value || 1,
                });
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

        const isLast = currentTurnIndex === turnOrder.length - 1;
        transaction.update(gameStateRef, {
          activeInteraction: null,
          phase: isLast ? "next_game" : "turn",
          currentTurnIndex: isLast ? 0 : currentTurnIndex + 1,
          currentRoll: null,
          currentRollPlayerId: null,
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
    },
  };
}
