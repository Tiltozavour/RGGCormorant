import { useState, useEffect, useCallback } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  updateDoc,
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
  
  const canRoll = !isAdmin && !!playerData?.inGame && isTurnPhase && isCurrentPlayersTurn && gameState.currentRoll === null;
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

  const handleUseCard = async (card: GameCard) => {
    if (!user || !playerData) return;
    try {
      const playerRef = doc(db, "players", user.uid);
      await updateDoc(playerRef, { inventory: arrayRemove(card.id) });

      if (card.action === 'add_coins') {
        await updateDoc(playerRef, { tiltCoins: increment(card.value) });
      } else if (card.action === 'move_steps') {
        alert(`Эффект: перемещение на ${card.value}`);
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
      handleMoveComplete,
      handleRoll,
      handleConfirmRoll,
      handleStepPhase,
      handlePrepareTurn,
    }
  };
}