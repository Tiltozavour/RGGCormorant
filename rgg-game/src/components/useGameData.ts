import { useState, useEffect, useCallback } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  updateDoc,
  arrayUnion,
  increment,
  arrayRemove,
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
    return onSnapshot(collection(db, "cards"), (snap) => {
      const cardMap: Record<string, GameCard> = {};
      snap.docs.forEach((d) => { cardMap[d.id] = { id: d.id, ...d.data() } as GameCard; });
      setAllCards(cardMap);
    });
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
    await updateDoc(playerRef, {
      inventory: arrayUnion(cardId)
    });
    // Здесь можно добавить логику удаления карты из "пула доступных призов" в БД,
    // если она помечена как isUnique
  };

  const handleUseCard = async (card: GameCard, targetPlayerId?: string) => {
    if (!user || !playerData) return;
    try {
      const playerRef = doc(db, "players", user.uid);
      const targetRef = targetPlayerId ? doc(db, "players", targetPlayerId) : null;

      await updateDoc(playerRef, { inventory: arrayRemove(card.id) });

      switch (card.action) {
        case 'add_coins':
          // Если есть цель (например, кража), можно добавить логику здесь, 
          // но обычно монеты добавляются себе
          await updateDoc(playerRef, { tiltCoins: increment(card.value) });
          break;

        case 'move_steps':
          // Если выбрана цель (Судья душ / Жертвопредложение)
          const subjectRef = targetRef || playerRef;
          const subjectData = targetPlayerId ? players.find(p => p.id === targetPlayerId) : playerData;
          
          // Для мгновенного перемещения через карту
          const currentPos = subjectData?.position || 0;
          const newPos = currentPos + card.value;
          await updateDoc(subjectRef, { position: Math.max(0, newPos), prevCell: currentPos });
          
          if (targetPlayerId) {
            alert(`Игрок ${subjectData?.login} перемещен на ${card.value} кл.`);
          }
          break;

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

        default:
          console.warn("Действие карты не распознано:", card.action);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleMoveComplete = useCallback(async (position: number, prevCell: number | null) => {
    if (!user) return;
    const playerRef = doc(db, "players", user.uid);
    const gameStateRef = doc(db, "gameState", "current");

    await runTransaction(db, async (transaction) => {
      const gsSnap = await transaction.get(gameStateRef);
      if (!gsSnap.exists()) return;
      const gsData = gsSnap.data();
      const turnOrder: string[] = gsData.turnOrder || [];
      const currentTurnIndex: number = gsData.currentTurnIndex || 0;

      transaction.update(playerRef, { position, prevCell });

      if (turnOrder.length > 0 && currentTurnIndex === turnOrder.length - 1) {
        transaction.update(gameStateRef, {
          phase: "next_game",
          currentRoll: null,
          currentRollPlayerId: null,
          currentTurnIndex: 0,
          rollConfirmed: false,
        });
      } else {
        const nextTurnIndex = turnOrder.length > 0 ? (currentTurnIndex + 1) % turnOrder.length : currentTurnIndex;
        transaction.update(gameStateRef, {
          currentRoll: null,
          currentRollPlayerId: null,
          currentTurnIndex: nextTurnIndex,
          rollConfirmed: false,
        });
      }
    });
  }, [user]);

  const handleRoll = async () => {
    if (!user || !canRoll) return;
    await updateDoc(doc(db, "gameState", "current"), {
      currentRoll: Math.floor(Math.random() * 6) + 1,
      currentRollPlayerId: user.uid,
      rollConfirmed: false,
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
      handleRoll,
      handleConfirmRoll,
      handleStepPhase,
      handlePrepareTurn,
    }
  };
}