import { useState, useEffect, useCallback } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  arrayUnion,
  increment,
  arrayRemove,
  runTransaction,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import type { GameCard } from "../types/card";
import { defaultGameState } from "../types/game";
import type { GamePhase, GameState, Player } from "../types/game";
import { PHASE_ORDER } from "./gameConstants";

export function useGameData() {
  const [user, setUser] = useState<User | null>(null);
  const [playerData, setPlayerData] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState>(defaultGameState);
  const [allCards, setAllCards] = useState<Record<string, GameCard>>({});

  // Listeners
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
    return onSnapshot(collection(db, "players"), (snap) => {
      setPlayers(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });
  }, []);

  useEffect(() => {
    return onSnapshot(doc(db, "gameState", "current"), (snap) => {
      if (snap.exists()) setGameState({ ...defaultGameState, ...snap.data() } as GameState);
    });
  }, []);

  useEffect(() => {
    // Слушаем обычные карты
    const unsubCards = onSnapshot(collection(db, "cards"), (snap) => {
      const cards: Record<string, GameCard> = {};
      snap.docs.forEach((d) => { cards[d.id] = { id: d.id, ...d.data() } as GameCard; });
      setAllCards(prev => ({ ...prev, ...cards }));
    });

    // Слушаем призовые карты
    const unsubPrizes = onSnapshot(collection(db, "prizes"), (snap) => {
      const prizes: Record<string, GameCard> = {};
      snap.docs.forEach((d) => { prizes[d.id] = { id: d.id, ...d.data() } as GameCard; });
      setAllCards(prev => ({ ...prev, ...prizes }));
    });

    return () => { unsubCards(); unsubPrizes(); };
  }, []);

  // Derived State
  const isAdmin = playerData?.role === "admin";
  const currentTurnPlayerId = gameState.turnOrder[gameState.currentTurnIndex] ?? null;
  const isTurnPhase = gameState.phase === "turn";
  const isCurrentPlayersTurn = gameState.turnOrder.length === 0 || currentTurnPlayerId === user?.uid;
  
  const canRoll = !isAdmin && !!playerData?.inGame && isTurnPhase && isCurrentPlayersTurn && gameState.currentRoll === null && !playerData?.isFrozen;
  const canConfirmRoll = !isAdmin && !!playerData?.inGame && isCurrentPlayersTurn && gameState.currentRoll !== null && !gameState.rollConfirmed;

  // Handlers
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
    await updateDoc(doc(db, "players", user.uid), {
      position: cellId,
      prevCell: null,
      inGame: true,
      inventory: ["inv_006", "inv_007"]
    });
  };

  const updateAvatar = async (url: string) => {
    if (!user) return;
    await updateDoc(doc(db, "players", user.uid), { avatar: url });
  };

  // Метод для выдачи призовой (легендарной) карты игроку (только для админа)
  const grantPrizeCard = async (playerId: string, cardId: string) => {
    if (!isAdmin) return;
    const playerRef = doc(db, "players", playerId);
    const prizeRef = doc(db, "prizes", cardId);

    try {
      await runTransaction(db, async (transaction) => {
        const prizeSnap = await transaction.get(prizeRef);
        if (!prizeSnap.exists()) return;

        const prizeData = prizeSnap.data() as GameCard;
        // Если карта уникальная и уже выиграна — отменяем
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

    // Проверка прав и фаз игры (Админ может всё)
    if (!isAdmin) {
      const { phase, currentRoll } = gameState;

      if (phase === 'next_game') {
        // В фазе выбора игры можно только крутить колесо
        if (card.action !== 'spin_wheel') {
          alert("Эту карту можно использовать только во время хода на поле!");
          return;
        }
      } else if (phase === 'turn') {
        const isProtection = card.action === 'protection';
        const isExtraRoll = card.action === 'extra_roll';
        const isMovement = card.action === 'move_steps';

        // Защиту можно использовать всегда
        if (isProtection) return; 

        // Карты перемещения и переброса требуют твоего хода
        if (isExtraRoll || isMovement) {
          if (!isCurrentPlayersTurn) {
            alert("Сейчас не ваш ход!");
            return;
          }
        } else {
          // Все остальные карты — только в свой ход и ДО броска
          if (!isCurrentPlayersTurn) {
            alert("Сейчас не ваш ход!");
            return;
          }
          if (currentRoll !== null) {
            alert("Вы уже бросили кубик! Обычные карты используются ДО броска.");
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

    try {
      const playerRef = doc(db, "players", user.uid);
      const targetRef = targetPlayerId ? doc(db, "players", targetPlayerId) : null;

      await updateDoc(playerRef, { inventory: arrayRemove(card.id) });

      // Добавляем карту в глобальную коллекцию "открытых"
      await updateDoc(doc(db, "gameState", "current"), {
        revealedCards: arrayUnion(card.id)
      });

      switch (card.action) {
        case 'extra_roll': {
          // Вычисляем суммарный бонус, который был у текущего броска 
          // (разница между результатом с бонусами и чистым значением кубика)
          const activeBonus = (gameState.currentRoll ?? 0) - (gameState.lastBaseRoll ?? 0);
          
          await updateDoc(doc(db, "gameState", "current"), {
            currentRoll: null,
            rollConfirmed: false,
            rollBonus: activeBonus // Возвращаем накопленный бонус обратно в буфер для переброса
          });
          alert("Энергетик подействовал! Бросайте кубик еще раз.");
          break;
        }

        case 'add_coins':
          // Если есть цель (например, кража), можно добавить логику здесь, 
          // но обычно монеты добавляются себе
          await updateDoc(playerRef, { tiltCoins: increment(card.value) });
          break;

        case 'move_steps':
          {
            // Вместо телепортации по ID, мы добавляем шаги к текущему броску.
            // Это заставит фишку "идти" по карте, учитывая стрелочки и развилки.
            const targetId = targetPlayerId || user.uid;
            const isForward = card.value > 0;

            if (isForward && gameState.phase === 'turn') {
              // Проверяем: есть ли активный бросок ИМЕННО ДЛЯ ТЕКУЩЕГО игрока
              const isMyRollActive = gameState.currentRoll !== null && gameState.currentRollPlayerId === user.uid;

              if (!isMyRollActive) {
                // Если я еще не бросал — добавляем в скрытый бонус к будущему броску
                await updateDoc(doc(db, "gameState", "current"), {
                  rollBonus: increment(card.value)
                });
                alert(`Карта "${card.name}" активирована! К вашему следующему броску будет добавлено +${card.value} кл.`);
              } else {
                // Если я УЖЕ бросил кубик — увеличиваем текущее значение
                await updateDoc(doc(db, "gameState", "current"), {
                  currentRoll: increment(card.value),
                  currentRollPlayerId: targetId,
                  rollConfirmed: false 
                });
                alert(`Карта "${card.name}" добавила шаги! Теперь на счетчике: ${(gameState.currentRoll || 0) + card.value}`);
              }
            } else {
              // Для отрицательных перемещений (назад) оставляем телепортацию, 
              // так как карта обычно не поддерживает движение в обратную сторону по стрелкам.
              const subjectRef = targetRef || playerRef;
              const currentPos = (targetPlayerId ? players.find(p => p.id === targetPlayerId) : playerData)?.position || 0;
              await updateDoc(subjectRef, { 
                position: Math.max(0, currentPos + card.value), 
                prevCell: null 
              });
              alert(targetPlayerId ? "Игрок отброшен назад!" : "Вас отбросило назад!");
            }
            break;
          }

        case 'teleport':
          await updateDoc(playerRef, { position: card.value, prevCell: null });
          break;

        case 'freeze_player':
          if (targetRef) {
            await updateDoc(targetRef, { 
              isFrozen: true,
              freezeDuration: card.value || 1 
            });
            alert(`Игрок заморожен!`);
          }
          break;

        case 'spin_wheel':
          // Принудительно открываем колесо для всех (синхронизация через БД)
          await updateDoc(doc(db, "gameState", "current"), { showWheel: true });
          break;

        case 'challenge_gaben':
          // Реализация механики Габена: ставим статус испытания
          await updateDoc(playerRef, { 
            customStatus: 'gaben_challenge',
            statusDuration: 2 
          });
          alert("Испытание Габена принято! Не двигайтесь 2 хода.");
          break;

        case 'steal_coins':
          if (targetRef) {
            await runTransaction(db, async (transaction) => {
              const targetSnap = await transaction.get(targetRef);
              const currentTargetCoins = targetSnap.data()?.tiltCoins || 0;
              const stealAmount = Math.min(currentTargetCoins, card.value);
              transaction.update(targetRef, { tiltCoins: increment(-stealAmount) });
              transaction.update(playerRef, { tiltCoins: increment(stealAmount) });
            });
          }
          break;

        case 'protection':
          await updateDoc(playerRef, { hasProtection: true });
          break;

        case 'prize':
          alert(`🏆 СУПЕР-ПРИЗ!\nКарта будет удалена из инвентаря. Свяжитесь с администратором, назовите карту ${card.name}.`);
          break;
        
        case 'judge_coins':
          if (targetRef) {
            alert(`Судья душ: Игрок ${players.find(p => p.id === targetPlayerId)?.login} будет бросать кубик для +/- ${card.value} монет.`);
            // TODO: Implement actual dice roll for target and conditional coin change
          } else {
            alert(`Судья душ: Выберите цель для применения эффекта.`);
          }
          break;

        case 'deal_with_mage':
          alert(`Сделка с магом: Бросьте кубик, чтобы узнать свою судьбу!`);
          // TODO: Implement dice roll and apply effects (curse, add_coins)
          break;

        case 'discard_card':
          if (targetRef) {
            alert(`Оверпрайс: Игрок ${players.find(p => p.id === targetPlayerId)?.login} сбросит ${card.value} карту.`);
            // TODO: Implement logic to make target discard a card
          } else {
            alert(`Оверпрайс: Выберите игрока, чтобы сбросить его карту.`);
          }
          break;

        case 'steal_card':
          if (targetRef) {
            alert(`Лавка с сувенирами: Выберите карту у игрока ${players.find(p => p.id === targetPlayerId)?.login}.`);
            // TODO: Implement UI for current player to choose a card from target's inventory
          } else {
            alert(`Лавка с сувенирами: Выберите игрока, у которого хотите украсть карту.`);
          }
          break;

        case 'reflect_debuff':
          alert(`Уно реверс: Следующий дебафф будет отражен!`);
          // TODO: Implement a temporary status for reflecting debuffs
          break;

        // Для остальных новых действий пока оставим заглушки
        case 'move_target_for_coins': alert(`Заказное: Передвиньте игрока за монеты.`); break;
        case 'discard_next_drawn': alert(`Карт-бланш: Следующая карта будет сброшена.`); break;
        case 'move_target_and_self': alert(`Подвинься!: Передвиньте игрока и себя.`); break;
        case 'pay_or_move_back': alert(`Платити налоги!: Заплатите или отступите.`); break;
        case 'take_next_card': alert(`Благодетель: Присвойте следующую карту.`); break;
        case 'give_next_card': alert(`Такой себе пир: Отдайте следующую карту.`); break;

        default:
          console.warn("Действие карты не распознано:", card.action);
      }
    } catch (e) {
      console.error(e);
   }
  };

  // Вспомогательная функция для выбора рандомных карт (теперь одна копия)
  const getRandomInteractionCards = useCallback((type: 'gambling' | 'bshop'): string[] => {
    const cardsArray = Object.values(allCards);
    if (cardsArray.length === 0) return [];
    const result: string[] = [];
    for (let i = 0; i < 3; i++) {
      if (type === 'bshop') {
        const pool = cardsArray.filter(c => c.deck === 'inventory' && c.rarity !== 'legendary');
        if (pool.length > 0) result.push(pool[Math.floor(Math.random() * pool.length)].id);
      } else {
        const rand = Math.random();
        const pool = rand < 0.02 
          ? cardsArray.filter(c => c.rarity === 'legendary') 
          : rand < 0.35 
            ? cardsArray.filter(c => c.deck === 'inventory' && c.rarity !== 'legendary')
            : cardsArray.filter(c => c.deck === 'momental');
        if (pool.length > 0) result.push(pool[Math.floor(Math.random() * pool.length)].id);
      }
    }
    return result;
  }, [allCards]);

  const handleMoveComplete = useCallback(async (position: number, prevCell: number | null, cellType?: string) => {
    if (!user) return;
    const playerRef = doc(db, "players", user.uid);
    const gameStateRef = doc(db, "gameState", "current");
    await runTransaction(db, async (transaction) => {
      const gsSnap = await transaction.get(gameStateRef);
      if (!gsSnap.exists()) return;
      const { turnOrder = [], currentTurnIndex = 0 } = gsSnap.data() as GameState;
      transaction.update(playerRef, { position, prevCell });
      if (cellType === 'gambling' || cellType === 'bshop') {
        transaction.update(gameStateRef, {
          activeInteraction: { playerId: user.uid, type: cellType as any, cards: getRandomInteractionCards(cellType as any) }
        });
        return;
      }
      const isLast = currentTurnIndex === turnOrder.length - 1;
      transaction.update(gameStateRef, {
        phase: isLast ? "next_game" : "turn",
        currentTurnIndex: isLast ? 0 : currentTurnIndex + 1,
        currentRoll: null,
        currentRollPlayerId: null,
        rollConfirmed: false
      });
    });
  }, [user, getRandomInteractionCards]);

  const handleFinishInteraction = async (cardId?: string, cost: number = 0) => {
    if (!user || !gameState.activeInteraction) return;
    const playerRef = doc(db, "players", user.uid);
    const gameStateRef = doc(db, "gameState", "current");
    try {
      await runTransaction(db, async (transaction) => {
        const gsSnap = await transaction.get(gameStateRef);
        if (!gsSnap.exists()) return;
        const { turnOrder = [], currentTurnIndex = 0 } = gsSnap.data() as GameState;
        if (cardId) {
          const card = allCards[cardId];
          if (card.deck === 'inventory') {
            transaction.update(playerRef, { inventory: arrayUnion(card.id), tiltCoins: increment(-cost) });
          } else if (card.action === 'add_coins') {
            transaction.update(playerRef, { tiltCoins: increment(card.value) });
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
          rollConfirmed: false
        });
      });
    } catch (e) { console.error(e); }
  };


  const handleRoll = async () => {
    if (!user || !canRoll) return;
    const bonus = gameState.rollBonus || 0;
    const baseRoll = Math.floor(Math.random() * 6) + 1;
    
    await updateDoc(doc(db, "gameState", "current"), {
      currentRoll: baseRoll + bonus,
      lastBaseRoll: baseRoll,
      currentRollPlayerId: user.uid,
      rollConfirmed: false,
      rollBonus: 0, // Сбрасываем бонус после использования
    });
  };

  const handleConfirmRoll = async () => {
    if (!user || !canConfirmRoll) return;
    await updateDoc(doc(db, "gameState", "current"), { rollConfirmed: true });
  };

  const buildTurnState = () => {
    const activePlayers = players.filter((p) => p.inGame && p.role !== "admin");
    const sortedIds = [...activePlayers]
      .sort((a, b) => {
        const scoreA = a.tiltCoins ?? 0;
        const scoreB = b.tiltCoins ?? 0;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return gameState.turnOrder.indexOf(a.id) - gameState.turnOrder.indexOf(b.id);
      })
      .map((p) => p.id);

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
    }
  };
}