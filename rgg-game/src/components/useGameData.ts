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

const clearTemporaryStatus = {
  customStatus: null,
  statusDuration: 0,
};

/**
 * Р В  Р РЋРЎСџР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў, Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР’В¦Р В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В Р Р‹Р В Р РЏР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р СћРІР‚ВР В  Р В РІР‚В Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р В РІР‚В¦Р В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљР’В¦ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР’В¦.
 * @param player1Id ID Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р В РІР‚В Р В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂњР В  Р РЋРІР‚Сћ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р вЂ™Р’В°.
 * @param player2Id ID Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂњР В  Р РЋРІР‚Сћ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р вЂ™Р’В°.
 * @param allPlayers Р В  Р РЋРЎв„ўР В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚ВР В  Р В РІР‚В  Р В  Р В РІР‚В Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В¦ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р В РІР‚В  Р В  Р В РІР‚В  Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’Вµ.
 * @param map Р В  Р РЋРІвЂћСћР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂњР В  Р РЋРІР‚Сћ Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ.
 * @returns true, Р В  Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚В Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р В Р РЏР В  Р СћРІР‚ВР В  Р РЋРІР‚СћР В  Р РЋР’В, Р В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’Вµ false.
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

  // Р В  Р вЂ™Р’В­Р В Р Р‹Р Р†Р вЂљРЎвЂєР В Р Р‹Р Р†Р вЂљРЎвЂєР В  Р вЂ™Р’ВµР В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р вЂ™Р’В°Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СњР В  Р РЋРІР‚В Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р Р‹Р Р†Р вЂљР’В¦ Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р Р†РІР‚С›РІР‚вЂњ Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В· Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В·Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р Р‹Р Р†Р вЂљР’В¦
  useEffect(() => {
    // Р В  Р РЋРІР‚С”Р В Р Р‹Р Р†Р вЂљР Р‹Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р РЋР’ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р РЋРІР‚СњР В  Р РЋРІР‚Сћ Р В  Р вЂ™Р’В°Р В  Р СћРІР‚ВР В  Р РЋР’ВР В  Р РЋРІР‚ВР В  Р В РІР‚В¦, Р В Р Р‹Р Р†Р вЂљР Р‹Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В  Р вЂ™Р’В±Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В·Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В¶Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎвЂєР В  Р вЂ™Р’В»Р В  Р РЋРІР‚ВР В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В  Р В РІР‚В  Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚В
    if (!isAdmin || !gameState.activeDuels) return;

    const finishedDuelIds = Object.keys(gameState.activeDuels).filter(
      (id) => gameState.activeDuels[id].status === "finished"
    );

    if (finishedDuelIds.length === 0) return;

    // Р В  Р В РІвЂљВ¬Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В  Р В РІР‚В Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚ВР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В  Р РЋР’В Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В¶Р В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚Сљ (Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚ВР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™, 15 Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’ВµР В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚СљР В  Р В РІР‚В¦Р В  Р СћРІР‚В), Р В Р Р‹Р Р†Р вЂљР Р‹Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В  Р вЂ™Р’В±Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚В Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В Р Р‹Р РЋРІР‚СљР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В·Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ў
    const timer = setTimeout(async () => {
      const gsRef = doc(db, "gameState", "current");
      const updates: Record<string, any> = {};
      
      finishedDuelIds.forEach((id) => {
        updates[`activeDuels.${id}`] = deleteField();
      });

      await updateDoc(gsRef, updates).catch(e => console.error("Р В  Р РЋРІР‚С”Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СњР В  Р РЋРІР‚В Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р Р†РІР‚С›РІР‚вЂњ:", e));
    }, 15000);

    return () => clearTimeout(timer);
  }, [gameState.activeDuels, isAdmin]);

  // Р В  Р Р†Р вЂљРІвЂћСћР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂњР В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В Р Р‹Р В Р РЏ Р В Р Р‹Р Р†Р вЂљРЎвЂєР В Р Р‹Р РЋРІР‚СљР В  Р В РІР‚В¦Р В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљ Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚ВР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ Р В Р Р‹Р В Р Р‰Р В Р Р‹Р Р†Р вЂљРЎвЂєР В Р Р‹Р Р†Р вЂљРЎвЂєР В  Р вЂ™Р’ВµР В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р В РІР‚В¦Р В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“
  const applyMomentalCardEffect = useCallback(
    async (
      player: Player, // Р В  Р вЂ™Р’ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚Сњ, Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂњР В  Р РЋРІР‚Сћ Р В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р Р†РІР‚С›РІР‚вЂњР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°
      momentalCard: GameCard, // Р В  Р РЋРЎв„ўР В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°
      transaction: any, // Firestore transaction
    ) => {
      if (!momentalCard || momentalCard.deck !== "momental") {
        console.error("Р В  Р РЋРЎСџР В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂќР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚ВР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В Р Р‹Р В Р Р‰Р В Р Р‹Р Р†Р вЂљРЎвЂєР В Р Р‹Р Р†Р вЂљРЎвЂєР В  Р вЂ™Р’ВµР В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ-Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р В РІР‚В¦Р В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В  Р Р†РІР‚С›РІР‚вЂњР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р вЂ™Р’В°:", momentalCard);
        return;
      }

      const playerDocRef = doc(db, "players", player.id);
      const gameStateRef = doc(db, "gameState", "current");

      let actualValue = momentalCard.value;
      let promoCodeUsed = false;

      // Р В  Р РЋРЎСџР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р РЋРЎСџР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р РЋРІР‚ВР В  Р РЋРІР‚Сњ, Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р РЋРІР‚СњР В  Р РЋРІР‚Сћ Р В  Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В Р Р‹Р В Р Р‰Р В Р Р‹Р Р†Р вЂљРЎвЂєР В Р Р‹Р Р†Р вЂљРЎвЂєР В  Р вЂ™Р’ВµР В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В  Р РЋРІР‚вЂњР В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р В РІР‚В Р В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р Р†РІР‚С›РІР‚вЂњ
      if (
        (momentalCard.action === "add_coins" && momentalCard.value < 0) ||
        (momentalCard.action === "move_steps" && momentalCard.value < 0) ||
        momentalCard.action === "skip_turn" ||
        (momentalCard.action === "teleport" && momentalCard.value === 0) // Р В  Р РЋРЎСџР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂњР В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В  Р РЋР’В, Р В Р Р‹Р Р†Р вЂљР Р‹Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚Сћ Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° 0 - Р В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В  Р РЋРІР‚вЂњР В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р В РІР‚В Р В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р Р†РІР‚С›РІР‚вЂњ
      ) {
        if (player.customStatus === "promo_code_active") {
          actualValue = Math.ceil(momentalCard.value / 2); // Р В  Р В РІвЂљВ¬Р В  Р РЋР’ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В Р Р‹Р В Р вЂ°Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В  Р РЋР’В Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р Р‹Р В РІР‚в„– Р В  Р В РІР‚В Р В  Р СћРІР‚ВР В  Р В РІР‚В Р В  Р РЋРІР‚СћР В  Р вЂ™Р’Вµ, Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В  Р РЋРІР‚вЂњР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏР В Р Р‹Р В Р РЏ Р В  Р В РІР‚В  Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РІР‚в„– Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В Р Р‹Р РЋРІР‚Сљ
          promoCodeUsed = true;
          transaction.update(playerDocRef, clearTemporaryStatus); // Р В  Р В Р вЂ№Р В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В  Р РЋР’В Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РЎвЂњ Р В  Р РЋРЎСџР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р РЋРІР‚ВР В  Р РЋРІР‚СњР В  Р вЂ™Р’В°
          notify(`Р В  Р РЋРЎСџР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р РЋРІР‚ВР В  Р РЋРІР‚Сњ Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»! Р В  Р Р†Р вЂљРІвЂћСћР В  Р вЂ™Р’В°Р В Р Р‹Р Р†РІР‚С™Р’В¬ Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎвЂє Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ "${momentalCard.name}" Р В Р Р‹Р РЋРІР‚СљР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В Р Р‹Р В Р вЂ°Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦ Р В  Р СћРІР‚ВР В  Р РЋРІР‚Сћ ${Math.abs(actualValue)} Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў.`, 'success', momentalCard.id);
          logEvent({
            id: `promo_code_used_momental_${momentalCard.id}_${Date.now()}`,
            timestamp: Date.now(), type: 'status_effect',
            message: `${player.login} Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» Р В  Р РЋРЎСџР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р РЋРІР‚ВР В  Р РЋРІР‚Сњ Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В Р Р‹Р РЋРІР‚СљР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В Р Р‹Р В Р вЂ°Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎвЂєР В  Р вЂ™Р’В° Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ "${momentalCard.name}".`,
            playerId: player.id, cardId: momentalCard.id,
            details: { originalAmount: momentalCard.value, finalAmount: actualValue }
          });
        }
      }

      // Р В  Р РЋРЎСџР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚ВР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’ВµР В  Р РЋР’В Р В Р Р‹Р В Р Р‰Р В Р Р‹Р Р†Р вЂљРЎвЂєР В Р Р‹Р Р†Р вЂљРЎвЂєР В  Р вЂ™Р’ВµР В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ў
      if (momentalCard.action === "add_coins") {
        transaction.update(playerDocRef, { tiltCoins: increment(actualValue) });
        if (!promoCodeUsed) {
          notify(`${player.login} ${actualValue > 0 ? 'Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В»' : 'Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’В»'} ${Math.abs(actualValue)} Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ "${momentalCard.name}".`, actualValue > 0 ? 'success' : 'error', momentalCard.id);
          logEvent({
            id: `momental_coin_change_${momentalCard.id}_${Date.now()}`,
            timestamp: Date.now(), type: 'coin_change',
            message: `${player.login} ${actualValue > 0 ? 'Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В»' : 'Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’В»'} ${Math.abs(actualValue)} Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ "${momentalCard.name}".`,
            playerId: player.id, cardId: momentalCard.id, details: { amount: actualValue, reason: 'momental_card_effect', cardName: momentalCard.name }
          });
        }
      } else if (momentalCard.action === "move_steps") {
        const currentPos = player.position || 0;
        transaction.update(playerDocRef, {
          position: Math.max(0, currentPos + actualValue),
          prevCell: null,
        });
        notify(`${player.login} Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° ${actualValue} Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В  Р РЋРІР‚Сњ Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ "${momentalCard.name}".`, 'info', momentalCard.id);
        logEvent({
          id: `momental_move_${momentalCard.id}_${Date.now()}`,
          timestamp: Date.now(), type: 'movement',
          message: `${player.login} Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° ${actualValue} Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В  Р РЋРІР‚Сњ Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ "${momentalCard.name}".`,
          playerId: player.id, cardId: momentalCard.id, details: { steps: actualValue, reason: 'momental_card_effect', cardName: momentalCard.name }
        });
      } else if (momentalCard.action === "teleport") {
        transaction.update(playerDocRef, { position: actualValue, prevCell: null });
        notify(`${player.login} Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚Сљ ${actualValue} Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ "${momentalCard.name}".`, 'info', momentalCard.id);
        logEvent({
          id: `momental_teleport_${momentalCard.id}_${Date.now()}`,
          timestamp: Date.now(), type: 'movement',
          message: `${player.login} Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚Сљ ${actualValue} Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ "${momentalCard.name}".`,
          playerId: player.id, cardId: momentalCard.id, details: { targetPosition: actualValue, reason: 'momental_card_effect', cardName: momentalCard.name }
        });
      }
      // Р В  Р Р†Р вЂљРЎСљР В  Р РЋРІР‚СћР В  Р вЂ™Р’В±Р В  Р вЂ™Р’В°Р В  Р В РІР‚В Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’ВµР В  Р РЋР’В Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ Р В  Р В РІР‚В  Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚СњР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’Вµ
      transaction.update(gameStateRef, { revealedCards: arrayUnion(momentalCard.id) });
    },
    [allCards, notify, logEvent] // Р В  Р Р†Р вЂљРІР‚СњР В  Р вЂ™Р’В°Р В  Р В РІР‚В Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚ВР В  Р РЋР’ВР В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚В Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ useCallback
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
        if (!prizeSnap.exists()) return;

        const prizeData = prizeSnap.data() as GameCard;
        if (prizeData.isUnique && prizeData.isWon) return;

        transaction.update(playerRef, { inventory: arrayUnion(cardId) });
        transaction.update(prizeRef, { isWon: true, winnerId: playerId });
      });
    } catch (e) {
      console.error("Р В  Р РЋРІР‚С”Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚В Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°:", e);
    }
  };

  const handleUseCard = async (card: GameCard, targetPlayerId?: string) => {
    if (!user || !playerData) return;

    if (!isAdmin) {
      const { phase, currentRoll } = gameState;

      if (phase === "next_game") {
        if (card.action !== "spin_wheel") {
          alert("Р В  Р вЂ™Р’В­Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р вЂ™Р’В¶Р В  Р В РІР‚В¦Р В  Р РЋРІР‚Сћ Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р РЋРІР‚СњР В  Р РЋРІР‚Сћ Р В  Р В РІР‚В Р В  Р РЋРІР‚Сћ Р В  Р В РІР‚В Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р РЋР’ВР В Р Р‹Р В Р РЏ Р В Р Р‹Р Р†Р вЂљР’В¦Р В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р вЂ™Р’В° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В  Р вЂ™Р’Вµ!");
          return;
        }
      } else if (phase === "turn") {
        const isProtection = card.action === "protection";
        const isExtraRoll = card.action === "extra_roll";
        const isMovement = card.action === "move_steps";
        const isCommunism = card.action === "communism";
        const isPromoCode = card.action === "promo_code_benefit";

        if (!isProtection && !isCommunism && !isPromoCode) {
          if (!isCurrentPlayersTurn) {
            notify("Р В  Р В Р вЂ№Р В  Р вЂ™Р’ВµР В  Р Р†РІР‚С›РІР‚вЂњР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†РІР‚С™Р’В¬ Р В Р Р‹Р Р†Р вЂљР’В¦Р В  Р РЋРІР‚СћР В  Р СћРІР‚В!", 'warning');
            return;
          }

          if (!isMovement && !isExtraRoll && currentRoll !== null) {
            notify("Р В  Р Р†Р вЂљРІвЂћСћР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В¶Р В  Р вЂ™Р’Вµ Р В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚ВР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В±Р В  Р РЋРІР‚ВР В  Р РЋРІР‚Сњ. Р В  Р РЋРІР‚С”Р В  Р вЂ™Р’В±Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р Р‹Р Р†Р вЂљР Р‹Р В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р вЂ™Р’В·Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РІР‚в„–Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ Р В  Р СћРІР‚ВР В  Р РЋРІР‚Сћ Р В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚СњР В  Р вЂ™Р’В°.", 'warning');
            return;
          }
        }

        if (isExtraRoll && currentRoll === null) {
          notify("Р В  Р В Р вЂ№Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’В° Р В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р вЂ°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В±Р В  Р РЋРІР‚ВР В  Р РЋРІР‚Сњ!", 'warning');
          return;
        }
      } else {
        notify("Р В  Р В Р вЂ№Р В  Р вЂ™Р’ВµР В  Р Р†РІР‚С›РІР‚вЂњР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р вЂ™Р’В·Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“. Р В  Р Р†Р вЂљРЎСљР В  Р РЋРІР‚СћР В  Р вЂ™Р’В¶Р В  Р СћРІР‚ВР В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р вЂ° Р В  Р В РІР‚В¦Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В¶Р В  Р В РІР‚В¦Р В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ Р В Р Р‹Р Р†Р вЂљРЎвЂєР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В·Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“.", 'warning');
        return;
      }
    }

    if (card.action === "protection" && playerData.hasProtection) {
      notify("Р В  Р В РІвЂљВ¬ Р В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњ Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В¶Р В  Р вЂ™Р’Вµ Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р В РІР‚В Р В  Р В РІР‚В¦Р В  Р РЋРІР‚Сћ Р В  Р В Р вЂ№Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р РЋРІР‚СћР В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В  Р вЂ™Р’Вµ! Р В  Р РЋРЎС™Р В  Р вЂ™Р’Вµ Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ў Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ Р В  Р В РІР‚В Р В  Р РЋРІР‚вЂќР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РІР‚в„–.", 'info');
      return;
    }

    const targetRef = targetPlayerId ? doc(db, "players", targetPlayerId) : null;
    const targetPlayer = getPlayerById(targetPlayerId);

    // --- Р В  Р РЋРЎСџР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ inv_018 Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р СћРІР‚В Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљР’В¦Р В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р вЂ™Р’ВµР В  Р РЋР’В ---
    // Р В  Р вЂ™Р’В­Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚Сћ Р В  Р РЋРІР‚вЂњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў, Р В Р Р‹Р Р†Р вЂљР Р‹Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚Сћ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В  Р вЂ™Р’В±Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р вЂ™Р’В°, Р В  Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“.
    if (card.id === "inv_016" && card.action === "steal_coins") {
      if (!targetPlayerId || !targetPlayer) {
        notify("Р В  Р РЋРЎС™Р В  Р вЂ™Р’ВµР В  Р РЋРІР‚СћР В  Р вЂ™Р’В±Р В Р Р‹Р Р†Р вЂљР’В¦Р В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р РЋРІР‚ВР В  Р РЋР’ВР В  Р РЋРІР‚Сћ Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В Р Р‹Р Р†Р вЂљ Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ° Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚СњР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В¶Р В  Р РЋРІР‚В Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў.", 'warning'); // Changed from alert
        logEvent({
          id: `card_use_fail_${card.id}_${Date.now()}`,
          timestamp: Date.now(),
          type: 'error',
          message: `${playerData.login} Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» Р В Р Р‹Р Р†Р вЂљ Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ° Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ "${card.name}".`,
          cardId: card.id, playerId: user.uid
        });
        return; // Р В  Р РЋРІвЂћСћР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљР’В¦Р В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ
      }

      const currentPlayerPosition = playerData.position;
      const targetPlayerPosition = targetPlayer.position;
      if (currentPlayerPosition === undefined || targetPlayerPosition === undefined) {
        notify("Р В  Р РЋРЎС™Р В  Р вЂ™Р’Вµ Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р вЂ° Р В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В·Р В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚В Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р В РІР‚В .", 'error'); // Changed from alert
        logEvent({
          id: `card_use_fail_${card.id}_${Date.now()}`,
          timestamp: Date.now(),
          type: 'error',
          message: `${playerData.login} Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В Р Р‹Р В РЎвЂњР В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂњ Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ "${card.name}" Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В·-Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚СћР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р РЋРІР‚В Р В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В·Р В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљ Р В  Р РЋРІР‚ВР В  Р Р†РІР‚С›РІР‚вЂњ.`,
          cardId: card.id, playerId: user.uid
        });
        return; // Р В  Р РЋРІвЂћСћР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљР’В¦Р В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ
      }

      if (!isPlayerNearby(user.uid, targetPlayerId, players, gameMap)) {
        notify("Р В  Р вЂ™Р’В¦Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ° Р В  Р СћРІР‚ВР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В  Р вЂ™Р’В¶Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р вЂ™Р’В±Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ Р В  Р вЂ™Р’В¶Р В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СњР В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В  Р Р†РІР‚С›РІР‚вЂњ.", 'warning'); // Changed from alert
        logEvent({
          id: `card_use_fail_${card.id}_${Date.now()}`,
          timestamp: Date.now(),
          type: 'warning',
          message: `${playerData.login} Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В Р Р‹Р В РЎвЂњР В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂњ Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ "${card.name}": Р В Р Р‹Р Р†Р вЂљ Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р В Р РЏР В  Р СћРІР‚ВР В  Р РЋРІР‚СћР В  Р РЋР’В.`,
          cardId: card.id, playerId: user.uid, targetPlayerId: targetPlayerId
        });
        return; // Р В  Р РЋРІвЂћСћР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљР’В¦Р В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ
      }
    }
    // --- Р В  Р РЋРІвЂћСћР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљ  Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р В РІР‚В¦Р В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СњР В  Р РЋРІР‚В ---

    const playerRef = doc(db, "players", user.uid);

    try {
      const targetHasReflect = targetPlayer?.customStatus === "reflect_debuff";
      const targetHasFish = targetPlayer?.customStatus === "fish_shield";
      const targetHasPromoCode = targetPlayer?.customStatus === "promo_code_active";

      // Log card usage before removing from inventory
      logEvent({
        id: `card_play_${card.id}_${Date.now()}`,
        timestamp: Date.now(),
        type: 'card_play',
        message: `${playerData.login} Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р вЂ™Р’В·Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ "${card.name}"${targetPlayer ? ` Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° ${targetPlayer.login}` : ''}.`,
        cardId: card.id,
        playerId: user.uid,
        targetPlayerId: targetPlayerId
      });

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
          notify("Р В  Р РЋРЎСџР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњ Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦. Р В  Р Р†Р вЂљР’ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В°Р В  Р Р†РІР‚С›РІР‚вЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В±Р В  Р РЋРІР‚ВР В  Р РЋРІР‚Сњ Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’Вµ Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В·.", 'info', card.id); // Changed from alert
          logEvent({
            id: `extra_roll_activated_${Date.now()}`,
            timestamp: Date.now(),
            type: 'status_effect',
            message: `${playerData.login} Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњ Р В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В±Р В  Р РЋРІР‚ВР В  Р РЋРІР‚СњР В  Р вЂ™Р’В°.`,
            playerId: user.uid,
            cardId: card.id
          });
          break;
        }

        case "add_coins":
          await updateDoc(playerRef, { tiltCoins: increment(card.value) });
          notify(`Р В  Р Р†Р вЂљРІвЂћСћР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В ${card.value} Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў.`, 'success', card.id); // Changed from alert
          logEvent({
            id: `coin_gain_${card.id}_${Date.now()}`,
            timestamp: Date.now(), type: 'coin_change', message: `${playerData.login} Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В» ${card.value} Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў.`,
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
              if (roll >= 4) {
                let stealAmount = card.value; // Default steal amount (5 for inv_016)
                let victimLoss = card.value; // Default victim loss (5 for inv_016)

                if (targetHasPromoCode) {
                  stealAmount = 2; // Thief gets only 2 coins as per inv_019 description
                  victimLoss = 2; // Victim loses 2 coins
                  await updateDoc(targetRef, clearTemporaryStatus); // Clear promo code status from victim
                  notify(`Р В  Р РЋРЎСџР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р РЋРІР‚ВР В  Р РЋРІР‚Сњ Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»! ${targetPlayer.login} Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’В» Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р РЋРІР‚СњР В  Р РЋРІР‚Сћ 2 Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“, Р В  Р вЂ™Р’В° ${playerData.login} Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В» 2.`, 'success', card.id);
                  logEvent({
                    id: `promo_code_used_katjit_${card.id}_${Date.now()}`,
                    timestamp: Date.now(), type: 'status_effect',
                    message: `${targetPlayer.login} Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» Р В  Р РЋРЎСџР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р РЋРІР‚ВР В  Р РЋРІР‚Сњ Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р В РІР‚В  Р В  Р РЋРІвЂћСћР В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В¶Р В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°.`,
                    playerId: targetPlayer.id, cardId: card.id,
                    details: { originalSteal: card.value, actualSteal: stealAmount }
                  });
                }

                if (stealAmount > 0) {
                  await runTransaction(db, async (transaction) => {
                    const targetSnap = await transaction.get(targetRef);
                    const currentTargetCoins = targetSnap.data()?.tiltCoins || 0;
                    const actualVictimLoss = Math.min(currentTargetCoins, victimLoss); // Victim can't lose more than they have

                    transaction.update(targetRef, { tiltCoins: increment(-actualVictimLoss) });
                    transaction.update(playerRef, { tiltCoins: increment(actualVictimLoss) }); // Thief gets what victim actually lost
                  });
                  notify(`Р В  Р РЋРІвЂћСћР В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В±Р В  Р РЋРІР‚ВР В  Р РЋРІР‚Сњ: ${roll}. Р В  Р В РІвЂљВ¬Р В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’В°. Р В  Р Р†Р вЂљРІвЂћСћР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В Р Р‹Р РЋРІР‚СљР В  Р РЋРІР‚СњР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В ${stealAmount} Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў.`, 'success', card.id);
                } else {
                  notify("Р В  Р В РІвЂљВ¬ Р В Р Р‹Р Р†Р вЂљ Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р В РІР‚В¦Р В  Р РЋРІР‚Сћ Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚СњР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В¶Р В  Р РЋРІР‚В.", 'info');
                }
              } else {
                await updateDoc(playerRef, { tiltCoins: increment(-card.value) }); // inv_016 value is 5
                notify(`Р В  Р РЋРІвЂћСћР В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В±Р В  Р РЋРІР‚ВР В  Р РЋРІР‚Сњ: ${roll}. Р В  Р РЋРЎС™Р В  Р вЂ™Р’ВµР В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’В°. Р В  Р Р†Р вЂљРІвЂћСћР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В ${card.value} Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў.`, 'error', card.id);
              }
            } else {
              await runTransaction(db, async (transaction) => {
                const targetSnap = await transaction.get(targetRef);
                const currentTargetCoins = targetSnap.data()?.tiltCoins || 0;
                const stealAmount = Math.min(currentTargetCoins, card.value);
                transaction.update(targetRef, { tiltCoins: increment(-stealAmount) });
                transaction.update(playerRef, { tiltCoins: increment(stealAmount) });
              });
              notify(`Р В  Р Р†Р вЂљРІвЂћСћР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В Р Р‹Р РЋРІР‚СљР В  Р РЋРІР‚СњР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В ${card.value} Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В Р Р‹Р РЋРІР‚Сљ ${targetPlayer.login}.`, 'success', card.id); // Changed from alert
              logEvent({
                id: `steal_other_card_${card.id}_${Date.now()}`,
                timestamp: Date.now(), type: 'coin_change',
                message: `${playerData.login} Р В Р Р‹Р РЋРІР‚СљР В  Р РЋРІР‚СњР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» ${card.value} Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В Р Р‹Р РЋРІР‚Сљ ${targetPlayer.login} Р В Р Р‹Р В РЎвЂњ Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљР’В°Р В Р Р‹Р В Р вЂ°Р В Р Р‹Р В РІР‚в„– Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ "${card.name}".`,
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
            // Р В  Р Р†Р вЂљРЎвЂќР В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂњР В  Р РЋРІР‚ВР В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ "Р В  Р РЋРЎвЂєР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р РЋРІР‚СњР В  Р РЋРІР‚Сћ Р В  Р В РІР‚В Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р СћРІР‚В!" (inv_007) Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚В Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р РЋРІР‚В Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р СћРІР‚ВР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В  Р РЋРІР‚вЂњР В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂњР В  Р РЋРІР‚Сћ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р вЂ™Р’В°
            if (card.id === "inv_007" && isHostile) {
              if (targetHasFish) {
                await updateDoc(targetRef!, clearTemporaryStatus);
                notify(`${targetPlayer?.login} Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р вЂ™Р’Вµ Р В  Р вЂ™ Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ!`, 'warning', allCards[targetPlayer.inventory?.find(id => allCards[id]?.action === 'fish_protection') || '']?.id);
                logEvent({
                  id: `move_blocked_${card.id}_${Date.now()}`,
                  timestamp: Date.now(), type: 'status_effect',
                  message: `${targetPlayer?.login} Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ў ${playerData.login} Р В Р Р‹Р В РЎвЂњ Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљР’В°Р В Р Р‹Р В Р вЂ°Р В Р Р‹Р В РІР‚в„– Р В  Р вЂ™ Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р РЋРІР‚В.`,
                  playerId: targetPlayer?.id, targetPlayerId: user.uid, cardId: card.id,
                  details: { protectionCard: 'inv_006' }
                });
                break;
              }
              
              await updateDoc(doc(db, "gameState", "current"), {
                forcedMovePlayerId: targetId,
                currentRoll: card.value,
                currentRollPlayerId: user.uid,
                rollConfirmed: false
              });
              notify(`Р В  Р Р†Р вЂљРІвЂћСћР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В Р Р‹Р РЋРІР‚СљР В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р В РІР‚В Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р вЂ™Р’ВµР В  Р РЋР’В Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р вЂ™Р’В° ${targetPlayer?.login} Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° ${card.value} Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂњ(Р В  Р вЂ™Р’В°).`, 'info', card.id);
              logEvent({
                id: `forced_move_start_${card.id}_${Date.now()}`,
                timestamp: Date.now(), type: 'movement',
                message: `${playerData.login} Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р В РІР‚В¦Р В  Р РЋРІР‚Сћ Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў ${targetPlayer?.login} Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° ${card.value} Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂњР В  Р РЋРІР‚СћР В  Р В РІР‚В .`,
                playerId: user.uid, targetPlayerId: targetId, cardId: card.id,
                details: { steps: card.value, reason: 'card_effect' }
              });
              break;
            }

            const isMyRollActive = 
              gameState.currentRoll !== null && gameState.currentRollPlayerId === user.uid;

            // Р В  Р Р†Р вЂљРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР’В°Р В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° Р В  Р вЂ™ Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ Р В  Р РЋРІР‚В Р В  Р РЋРІР‚С”Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В¶Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚СћР В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚в„–Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ Р В  Р СћРІР‚ВР В  Р РЋРІР‚Сћ switch-case
            // Р В  Р Р†Р вЂљРЎС›Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р РЋР’ВР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р СћРІР‚ВР В  Р РЋРІР‚СћР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В РІР‚в„–Р В  Р СћРІР‚ВР В  Р вЂ™Р’В°, Р В  Р вЂ™Р’В·Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ў, Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР’В°Р В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В  Р вЂ™Р’В±Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚Сћ.

            if (!isMyRollActive) {
              notify(`Р В  Р РЋРІвЂћСћ Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РІР‚в„–Р В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’ВµР В  Р РЋР’ВР В Р Р‹Р РЋРІР‚Сљ Р В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚Сљ Р В  Р СћРІР‚ВР В  Р РЋРІР‚СћР В  Р вЂ™Р’В±Р В  Р вЂ™Р’В°Р В  Р В РІР‚В Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚Сћ ${card.value} Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂњР В  Р РЋРІР‚СћР В  Р В РІР‚В .`, 'info', card.id); // Changed from alert
              logEvent({
                id: `roll_bonus_${card.id}_${Date.now()}`,
                timestamp: Date.now(), type: 'status_effect',
                message: `${playerData.login} Р В  Р СћРІР‚ВР В  Р РЋРІР‚СћР В  Р вЂ™Р’В±Р В  Р вЂ™Р’В°Р В  Р В РІР‚В Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В» ${card.value} Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂњР В  Р РЋРІР‚СћР В  Р В РІР‚В  Р В  Р РЋРІР‚Сњ Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РІР‚в„–Р В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’ВµР В  Р РЋР’ВР В Р Р‹Р РЋРІР‚Сљ Р В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚Сљ.`,
                playerId: user.uid, cardId: card.id,
                details: { amount: card.value, effect: 'roll_bonus' }
              });
              await updateDoc(doc(db, "gameState", "current"), {
                rollBonus: increment(card.value),
              });
            } else {
              notify(`Р В  Р РЋРЎвЂєР В  Р вЂ™Р’ВµР В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР’В°Р В  Р РЋРІР‚ВР В  Р Р†РІР‚С›РІР‚вЂњ Р В Р Р‹Р Р†Р вЂљР’В¦Р В  Р РЋРІР‚СћР В  Р СћРІР‚В Р В Р Р‹Р РЋРІР‚СљР В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦ Р В  Р СћРІР‚ВР В  Р РЋРІР‚Сћ ${(gameState.currentRoll || 0) + card.value}.`, 'info', card.id); // Changed from alert
              logEvent({
                id: `current_roll_increased_${card.id}_${Date.now()}`,
                timestamp: Date.now(), type: 'movement',
                message: `${playerData.login} Р В Р Р‹Р РЋРІР‚СљР В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В» Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР’В°Р В  Р РЋРІР‚ВР В  Р Р†РІР‚С›РІР‚вЂњ Р В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚СћР В  Р РЋРІР‚Сњ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° ${card.value} Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂњР В  Р РЋРІР‚СћР В  Р В РІР‚В .`,
                playerId: user.uid, cardId: card.id,
                details: { amount: card.value, effect: 'current_roll_increase' }
              });
              await updateDoc(doc(db, "gameState", "current"), {
                currentRoll: increment(card.value),
                currentRollPlayerId: targetId,
                rollConfirmed: false,
              });
            }
          } else {
            notify(targetPlayerId ? `${targetPlayer?.login} Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° ${card.value} Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂњР В  Р РЋРІР‚СћР В  Р В РІР‚В .` : `Р В  Р Р†Р вЂљРІвЂћСћР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° ${card.value} Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂњР В  Р РЋРІР‚СћР В  Р В РІР‚В .`, 'info', card.id); // Changed from alert
            logEvent({
              id: `player_moved_${card.id}_${Date.now()}`,
              timestamp: Date.now(), type: 'movement', message: `${targetPlayerId ? targetPlayer?.login : playerData.login} Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° ${card.value} Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂњР В  Р РЋРІР‚СћР В  Р В РІР‚В .`, playerId: targetPlayerId || user.uid, cardId: card.id, details: { steps: card.value, reason: 'card_effect' } // Log after protection checks
            });
            const subjectRef = targetRef || playerRef; // Use subjectRef after protection checks
            const currentPos =
              (targetPlayerId ? getPlayerById(targetPlayerId) : playerData)?.position || 0;
            await updateDoc(subjectRef, {
              position: Math.max(0, currentPos + card.value),
              prevCell: null,
            });
          }
          break;
        }

        case "teleport":
          await updateDoc(playerRef, { position: card.value, prevCell: null });
          notify(`Р В  Р Р†Р вЂљРІвЂћСћР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р вЂ° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚Сљ ${card.value}.`, 'info', card.id); // Changed from alert
          logEvent({
            id: `teleport_${card.id}_${Date.now()}`,
            timestamp: Date.now(),
            type: 'movement',
            message: `${playerData.login} Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚Сљ ${card.value}.`,
            playerId: user.uid,
            cardId: card.id,
            details: { targetPosition: card.value, reason: 'card_effect' }
          });
          break;

        case "teleport_to_type": {
          const currentPos = playerData.position ?? 0;
          const reachableBShops: number[] = []; // Р В  Р РЋРІвЂћСћР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СњР В  Р РЋРІР‚В B-Shop, Р В  Р СћРІР‚ВР В  Р РЋРІР‚Сћ Р В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р Р‹Р Р†Р вЂљР’В¦ Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р вЂ™Р’В¶Р В  Р В РІР‚В¦Р В  Р РЋРІР‚Сћ Р В  Р СћРІР‚ВР В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚В
          const visited = new Set<number>();
          const queue = [...(gameMap.find((c) => c.id === currentPos)?.next || [])]; // Р В  Р РЋРЎС™Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В  Р РЋР’В Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚Сњ Р В Р Р‹Р В РЎвЂњ Р В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљР’В¦ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В  Р РЋРІР‚Сњ

          while (queue.length > 0) {
            const currId = queue.shift()!;
            if (visited.has(currId)) continue;
            visited.add(currId);

            const cell = gameMap.find((c) => c.id === currId);
            if (!cell) continue; // Р В  Р РЋРЎСџР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂќР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В  Р РЋР’В, Р В  Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В  Р Р†РІР‚С›РІР‚вЂњР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р вЂ™Р’В°

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
            notify(`Р В  Р РЋРІвЂћСћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р Р†РІР‚С›РІР‚вЂњ Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В¶Р В  Р РЋРІР‚СћР В  Р РЋРІР‚Сњ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚Сљ ${targetId}.`, 'info', card.id);
            logEvent({
              id: `teleport_to_type_${card.id}_${Date.now()}`,
              timestamp: Date.now(), type: 'movement',
              message: `${playerData.login} Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В¶Р В  Р вЂ™Р’В°Р В  Р Р†РІР‚С›РІР‚вЂњР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р Р†РІР‚С›РІР‚вЂњ B-Shop (${targetId}).`,
              playerId: user.uid, cardId: card.id,
              details: { targetPosition: targetId, reason: 'card_effect' }
            });
          } else {
            notify("Р В  Р Р†Р вЂљРІвЂћСћР В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В  Р РЋРІР‚В Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В  Р Р†РІР‚С›РІР‚вЂњР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚Сћ Р В  Р В РІР‚В¦Р В  Р РЋРІР‚В Р В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р В РІР‚В¦Р В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂњР В  Р РЋРІР‚Сћ B-Shop.", 'warning', card.id);
            // Р В  Р Р†Р вЂљРЎС›Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В B-Shop Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В  Р Р†РІР‚С›РІР‚вЂњР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦, Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В  Р СћРІР‚ВР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В  Р вЂ™Р’В¶Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљР’В¦Р В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ°Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ. Р В  Р Р†Р вЂљРІвЂћСћР В  Р РЋРІР‚СћР В  Р вЂ™Р’В·Р В  Р В РІР‚В Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В  Р РЋР’В Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В.
            await updateDoc(playerRef, { inventory: arrayUnion(card.id) });
            await updateDoc(doc(db, "gameState", "current"), { revealedCards: arrayRemove(card.id) });
          }
          // Р В  Р Р†Р вЂљРЎС›Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљР’В¦Р В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ, Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚Сћ Р В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В  Р СћРІР‚ВР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В  Р вЂ™Р’В¶Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р вЂ™Р’В±Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В· Р В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р В Р РЏ Р В  Р В РІР‚В  Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’Вµ handleUseCard.
          // Р В  Р вЂ™Р’В­Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚Сћ Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В±Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’Вµ Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В  Р вЂ™Р’В¶Р В  Р В РІР‚В¦Р В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂњР В  Р РЋРІР‚ВР В  Р РЋРІР‚СњР В  Р РЋРІР‚В, Р В  Р В РІР‚В¦Р В  Р РЋРІР‚Сћ Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ "teleport_to_type" Р В Р Р‹Р В Р Р‰Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚Сћ Р В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В¶Р В  Р В РІР‚В¦Р В  Р РЋРІР‚Сћ.
          // Р В  Р Р†Р вЂљРІвЂћСћ Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’ВµР В  Р Р†РІР‚С›РІР‚вЂњ Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚В Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В¶Р В  Р вЂ™Р’Вµ Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р вЂ™Р’В°. Р В  Р Р†Р вЂљРЎС›Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В  Р Р†РІР‚С›РІР‚вЂњР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚Сћ B-Shop, Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В Р В  Р В РІР‚В¦Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В¶Р В  Р В РІР‚В¦Р В  Р РЋРІР‚Сћ Р В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р В РІР‚В¦Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ°.
          // Р В  Р вЂ™Р’В­Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚Сћ Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В¶Р В  Р вЂ™Р’Вµ Р В Р Р‹Р В РЎвЂњР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В  Р РЋРІР‚Сћ Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’Вµ: await updateDoc(playerRef, { inventory: arrayUnion(card.id) });
          break;
        }

        case "spin_wheel":
          await updateDoc(doc(db, "gameState", "current"), { showWheel: true });
          break;

        case "protection":
          await updateDoc(playerRef, { hasProtection: true });
          break;
        
        case "fish_protection":
          if (gameState.showWheel) {
            await updateDoc(doc(db, "gameState", "current"), { showWheel: false });
            notify("Р В  Р Р†Р вЂљРІвЂћСћР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚Сљ Р В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В°!", 'info', card.id);
          } else {
            await updateDoc(playerRef, {
              customStatus: "fish_shield",
              statusDuration: 1,
            });
            notify("No no no mr. Fish Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦. Р В  Р В Р вЂ№Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РІР‚в„–Р В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’В°Р В Р Р‹Р В Р РЏ Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р вЂ™Р’В±Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°.", 'info', card.id);
          }
          break;

        case "prize": // Р В  Р Р†Р вЂљРЎвЂќР В  Р вЂ™Р’ВµР В  Р РЋРІР‚вЂњР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“
          notify(`Р В  Р В Р вЂ№Р В Р Р‹Р РЋРІР‚СљР В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™-Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В·: ${card.name}. Р В  Р В Р вЂ№Р В  Р В РІР‚В Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’В¶Р В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р вЂ° Р В Р Р‹Р В РЎвЂњ Р В  Р вЂ™Р’В°Р В  Р СћРІР‚ВР В  Р РЋР’ВР В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋР’В.`, 'success', card.id);
          break;

        case "judge_coins":
          if (targetPlayerId && targetRef) {
            const isHostile = targetPlayerId !== user.uid;
            
            // 1. Р В  Р РЋРЎСџР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР’В°Р В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р вЂ™ Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ (Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р РЋРІР‚СњР В  Р РЋРІР‚Сћ Р В  Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В Р Р‹Р Р†Р вЂљ Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ° Р В Р вЂ Р В РІР‚С™Р Р†Р вЂљРЎСљ Р В  Р СћРІР‚ВР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В  Р РЋРІР‚вЂњР В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚Сњ)
            if (isHostile && targetHasFish) {
              await updateDoc(targetRef, clearTemporaryStatus);
              notify(`${targetPlayer?.login} Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» Р В Р Р‹Р В Р Р‰Р В Р Р‹Р Р†Р вЂљРЎвЂєР В Р Р‹Р Р†Р вЂљРЎвЂєР В  Р вЂ™Р’ВµР В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ў Р В Р Р‹Р В РЎвЂњР В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В Р Р‹Р В Р вЂ°Р В  Р РЋРІР‚В Р В  Р вЂ™ Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ!`, 'warning', 'inv_006');
              logEvent({
                id: `judge_blocked_${card.id}_${Date.now()}`,
                timestamp: Date.now(),
                type: 'status_effect',
                message: `${targetPlayer?.login} Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» "Р В  Р В Р вЂ№Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В Р Р‹Р В Р вЂ°Р В Р Р‹Р В РІР‚в„– Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†РІР‚С™Р’В¬" Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ў ${playerData.login} Р В Р Р‹Р В РЎвЂњ Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљР’В°Р В Р Р‹Р В Р вЂ°Р В Р Р‹Р В РІР‚в„– Р В  Р вЂ™ Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р РЋРІР‚В.`,
                playerId: targetPlayerId, targetPlayerId: user.uid, cardId: card.id
              });
              break;
            }

            // 2. Р В  Р Р†Р вЂљРЎвЂќР В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂњР В  Р РЋРІР‚ВР В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В¶Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В° Р В Р Р‹Р Р†Р вЂљ Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В
            const targetDoc = (isHostile && targetHasReflect) ? playerRef : (targetRef || playerRef);
            const targetLabel = targetHasReflect ? "Р В  Р Р†Р вЂљРІвЂћСћР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“" : targetPlayer?.login || "Р В  Р вЂ™Р’ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚Сњ";
            
            if (isHostile && targetHasReflect) {
              await updateDoc(targetRef, clearTemporaryStatus);
              notify(`${targetPlayer?.login} Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В·Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В» Р В Р Р‹Р В Р Р‰Р В Р Р‹Р Р†Р вЂљРЎвЂєР В Р Р‹Р Р†Р вЂљРЎвЂєР В  Р вЂ™Р’ВµР В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ў Р В Р Р‹Р В РЎвЂњР В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В Р Р‹Р В Р вЂ°Р В  Р РЋРІР‚В!`, 'warning', 'inv_012');
            }

            // 3. Р В  Р Р†Р вЂљР’ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚СћР В  Р РЋРІР‚Сњ Р В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В±Р В  Р РЋРІР‚ВР В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚В Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚ВР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р вЂ™Р’Вµ Р В Р Р‹Р В Р Р‰Р В Р Р‹Р Р†Р вЂљРЎвЂєР В Р Р‹Р Р†Р вЂљРЎвЂєР В  Р вЂ™Р’ВµР В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°
            const roll = rollD6();
            // Р В  Р Р†Р вЂљРЎС›Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В 4+ Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В  Р РЋР’В value (2), Р В  Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В 1-3 Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’ВµР В  Р РЋР’В value (2)
            const delta = roll >= 4 ? (card.value || 2) : -(card.value || 2);
            
            await updateDoc(targetDoc, { tiltCoins: increment(delta) });

            // 4. Р В  Р В РІвЂљВ¬Р В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚В Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂњР В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р вЂ™Р’Вµ
            const resultMsg = `${targetLabel} ${delta >= 0 ? "Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў" : "Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў"} ${Math.abs(delta)} Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў. Р В  Р РЋРІвЂћСћР В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В±Р В  Р РЋРІР‚ВР В  Р РЋРІР‚Сњ: ${roll}.`;
            notify(resultMsg, delta >= 0 ? 'success' : 'warning', card.id);
            logEvent({
              id: `judge_coins_result_${card.id}_${Date.now()}`,
              timestamp: Date.now(),
              type: 'coin_change',
              message: `${playerData.login} Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» "Р В  Р В Р вЂ№Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В Р Р‹Р В Р вЂ°Р В Р Р‹Р В РІР‚в„– Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†РІР‚С™Р’В¬". ${resultMsg}`,
              playerId: user.uid,
              targetPlayerId: targetHasReflect ? user.uid : targetPlayerId,
              cardId: card.id,
              details: { roll, delta, target: targetLabel }
            });
          } else {
            notify("Р В  Р РЋРЎС™Р В  Р вЂ™Р’ВµР В  Р РЋРІР‚СћР В  Р вЂ™Р’В±Р В Р Р‹Р Р†Р вЂљР’В¦Р В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р РЋРІР‚ВР В  Р РЋР’ВР В  Р РЋРІР‚Сћ Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р вЂ™Р’В°.", "warning");
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
            alert(`Р В  Р РЋРІвЂћСћР В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В±Р В  Р РЋРІР‚ВР В  Р РЋРІР‚Сњ: ${roll}. Р В  Р Р†Р вЂљРІвЂћСћР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р РЋРІР‚В Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В·Р В Р Р‹Р РЋРІР‚Сљ Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р РЏР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’Вµ gambling-Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ.`);
            notify(`Р В  Р РЋРІвЂћСћР В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В±Р В  Р РЋРІР‚ВР В  Р РЋРІР‚Сњ: ${roll}. Р В  Р Р†Р вЂљРІвЂћСћР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р РЋРІР‚В Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В·Р В Р Р‹Р РЋРІР‚Сљ Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р РЏР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’Вµ gambling-Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ.`, 'warning', card.id);
          } else if (roll <= 4) {
            await updateDoc(playerRef, { tiltCoins: increment(card.value) });
            await updateDoc(doc(db, "gameState", "current"), {
              activeInteraction: {
                playerId: user.uid,
                type: "gambling",
                cards: getRandomInteractionCards("gambling"),
              },
            });
            notify(`Р В  Р РЋРІвЂћСћР В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В±Р В  Р РЋРІР‚ВР В  Р РЋРІР‚Сњ: ${roll}. Р В  Р Р†Р вЂљРІвЂћСћР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В ${card.value} Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚В Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р РЏР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’Вµ gambling-Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ.`, 'info', card.id);
          } else {
            await updateDoc(playerRef, { tiltCoins: increment(card.value) });
            notify(`Р В  Р РЋРІвЂћСћР В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В±Р В  Р РЋРІР‚ВР В  Р РЋРІР‚Сњ: ${roll}. Р В  Р Р†Р вЂљРІвЂћСћР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В ${card.value} Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў.`, 'success', card.id);
          }
          break;
        }

        case "discard_card":
          if (targetRef && targetPlayerId) {
            if (targetHasFish) {
              await updateDoc(targetRef, clearTemporaryStatus); // Clear fish shield
              notify(`${targetPlayer?.login} Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р вЂ™ Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ!`, 'warning', 'inv_006');
              break;
            }

            const victimId = targetHasReflect ? user.uid : targetPlayerId;
            const victim = getPlayerById(victimId);

            if (!victim || !victim.inventory || victim.inventory.length === 0) {
              notify("Р В  Р В РІвЂљВ¬ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В°.", 'info');
              break;
            }

            if (targetHasReflect) {
              await updateDoc(targetRef, clearTemporaryStatus);
            }

            // Р В  Р Р†Р вЂљРІвЂћСћР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚Сћ Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’В°Р В  Р Р†РІР‚С›РІР‚вЂњР В  Р В РІР‚В¦Р В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂњР В  Р РЋРІР‚Сћ Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ, Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СњР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В  Р РЋР’В Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В¶Р В  Р РЋРІР‚ВР В  Р РЋР’В Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“
            await updateDoc(doc(db, "gameState", "current"), {
              activeInteraction: {
                playerId: user.uid,
                type: "discard_selection",
                targetPlayerId: victimId,
                // Р В  Р РЋРЎСџР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В  Р РЋР’В Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р СћРІР‚В Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В  Р РЋР’В Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚Сљ
                cards: shuffle(victim.inventory),
                actingCardId: card.id,
              }
            });
            if (targetHasReflect) alert("Р В  Р вЂ™Р’В­Р В Р Р‹Р Р†Р вЂљРЎвЂєР В Р Р‹Р Р†Р вЂљРЎвЂєР В  Р вЂ™Р’ВµР В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В¶Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦! Р В  Р Р†Р вЂљРІвЂћСћР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р СћРІР‚ВР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В  Р вЂ™Р’В¶Р В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В· Р В Р Р‹Р В РЎвЂњР В  Р В РІР‚В Р В  Р РЋРІР‚СћР В  Р вЂ™Р’ВµР В  Р РЋРІР‚вЂњР В  Р РЋРІР‚Сћ Р В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р В Р РЏ Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В°.");
          }
          break;

        case "steal_card":
          if (targetRef && targetPlayerId) {
            if (targetHasFish) {
              await updateDoc(targetRef, clearTemporaryStatus);
              alert(`${targetPlayer?.login} Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» Р В  Р РЋРІР‚СњР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В¶Р В Р Р‹Р РЋРІР‚Сљ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р вЂ™ Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ!`);
              break;
            }

            const victimId = targetHasReflect ? user.uid : targetPlayerId;
            const victim = getPlayerById(victimId);
            const recipientId = targetHasReflect ? targetPlayerId : user.uid;

            if (!victim || !victim.inventory || victim.inventory.length === 0) {
              alert("Р В  Р В РІвЂљВ¬ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚СњР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В¶Р В  Р РЋРІР‚В.");
              break;
            }

            if (targetHasReflect) {
              await updateDoc(targetRef, clearTemporaryStatus);
            }

            // Р В  Р РЋРІР‚С”Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СњР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В  Р РЋР’В Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В¶Р В  Р РЋРІР‚ВР В  Р РЋР’В Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ (Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р Р‹Р В Р вЂ° Р В  Р РЋРІР‚ВР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р В РІР‚В¦Р В  Р РЋРІР‚Сћ discard_card)
            await updateDoc(doc(db, "gameState", "current"), {
              activeInteraction: {
                playerId: user.uid,
                type: "discard_selection",
                targetPlayerId: victimId,
                recipientId: recipientId,
                // Р В  Р РЋРЎСџР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В  Р РЋР’В Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р СћРІР‚В Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В  Р РЋР’В Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚Сљ
                cards: shuffle(victim.inventory),
                actingCardId: card.id,
              }
            });
            if (targetHasReflect) notify("Р В  Р вЂ™Р’В­Р В Р Р‹Р Р†Р вЂљРЎвЂєР В Р Р‹Р Р†Р вЂљРЎвЂєР В  Р вЂ™Р’ВµР В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В¶Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦! Р В  Р Р†Р вЂљРІвЂћСћР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ Р В Р Р‹Р РЋРІР‚Сљ Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В±Р В Р Р‹Р В Р РЏ (Р В  Р РЋРІР‚В Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’Вµ Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В Р В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚Сљ).", 'warning');
          }
          break;

        case "reflect_debuff":
          await updateDoc(playerRef, {
            customStatus: "reflect_debuff",
            statusDuration: 1,
          });
          notify("Р В  Р В Р вЂ№Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РІР‚в„–Р В Р Р‹Р Р†Р вЂљР’В°Р В  Р РЋРІР‚ВР В  Р Р†РІР‚С›РІР‚вЂњ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р В РІР‚В Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р Р†РІР‚С›РІР‚вЂњ Р В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В±Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎвЂєР В Р Р‹Р Р†Р вЂљРЎвЂє Р В  Р вЂ™Р’В±Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В¶Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦.", 'info', card.id);
          break;

        case "move_target_for_coins": {
          if (!targetRef || !targetPlayerId) {
            notify("Р В  Р РЋРЎС™Р В  Р вЂ™Р’ВµР В  Р РЋРІР‚СћР В  Р вЂ™Р’В±Р В Р Р‹Р Р†Р вЂљР’В¦Р В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р РЋРІР‚ВР В  Р РЋР’ВР В  Р РЋРІР‚Сћ Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В Р Р‹Р Р†Р вЂљ Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ° Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ.", 'warning');
            break;
          }

            if (targetHasFish) {
              await updateDoc(targetRef, clearTemporaryStatus);
              notify(`${targetPlayer?.login} Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р вЂ™Р’Вµ Р В  Р вЂ™ Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ!`, 'warning', 'inv_006');
              break;
            }
            const steps = Math.min(playerData.tiltCoins ?? 0, 6);
            if (steps <= 0) {
              // This alert will be handled by AppClean.tsx
              // alert("Р В  Р В РІвЂљВ¬ Р В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В Р Р‹Р В Р Р‰Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“.");
              await updateDoc(playerRef, { inventory: arrayUnion(card.id) }); // Return card if no coins
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
              message: `${playerData.login} Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р вЂ™Р’В·Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў "Р В  Р РЋРІвЂћСћР В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В  Р РЋРІР‚вЂќР В Р Р‹Р Р†Р вЂљ Р В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚в„–" Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° ${targetPlayer?.login}.`,
              playerId: user.uid, targetPlayerId: targetPlayer?.id, cardId: card.id,
              details: { reflected: targetHasReflect }
            });
            break;
        }

        case "discard_next_drawn":
          await updateDoc(playerRef, { discardNextDrawn: true });
          notify("Р В  Р В Р вЂ№Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РІР‚в„–Р В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’В°Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° Р В  Р вЂ™Р’В±Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р вЂ™Р’В°.", 'info', card.id); // Changed from alert
          logEvent({
            id: `discard_next_drawn_${card.id}_${Date.now()}`,
            timestamp: Date.now(), type: 'status_effect',
            message: `${playerData.login} Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» "Р В  Р РЋРІвЂћСћР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ў-Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В Р Р‹Р Р†РІР‚С™Р’В¬". Р В  Р В Р вЂ№Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РІР‚в„–Р В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’В°Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° Р В  Р вЂ™Р’В±Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р вЂ™Р’В°.`,
            playerId: user.uid, cardId: card.id,
            details: { status: 'discardNextDrawn' }
          });
          break;

        case "duel": {
          if (!targetRef || !targetPlayerId || !targetPlayer) {
            notify("Р В  Р РЋРЎС™Р В  Р вЂ™Р’ВµР В  Р РЋРІР‚СћР В  Р вЂ™Р’В±Р В Р Р‹Р Р†Р вЂљР’В¦Р В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р РЋРІР‚ВР В  Р РЋР’ВР В  Р РЋРІР‚Сћ Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В Р Р‹Р Р†Р вЂљ Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ° Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В.", 'warning'); // Changed from alert
            logEvent({
              id: `duel_fail_${card.id}_${Date.now()}`,
              timestamp: Date.now(), type: 'error',
              message: `${playerData.login} Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» Р В Р Р‹Р Р†Р вЂљ Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ° Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В.`,
              cardId: card.id, playerId: user.uid
            });
            break;
          }

          const duelChallengerId = user.uid;
          const duelTargetId = targetPlayerId;
          const duelCardId = card.id;

          const targetHasFishProtection = targetPlayer.inventory?.includes("inv_006");

          // Р В  Р Р†Р вЂљРЎС™Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’ВµР В  Р РЋР’В Р В Р Р‹Р РЋРІР‚СљР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р Р†РІР‚С›РІР‚вЂњ ID Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В
          const newDuelId = `duel_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

          const initialDuelState: DuelState = {
            id: newDuelId,
            challengerId: duelChallengerId,
            targetId: duelTargetId,
            status: 'pending', // Р В  Р Р†Р вЂљРЎСљР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ° Р В  Р РЋРІР‚СћР В  Р вЂ™Р’В¶Р В  Р РЋРІР‚ВР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° Р В Р Р‹Р Р†Р вЂљ Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В¶Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ
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
            [`notifications.${duelTargetId}`]: {
              message: `${playerData.login} Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В·Р В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» Р В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°. Р В  Р РЋРЎв„ўР В  Р РЋРІР‚СћР В  Р вЂ™Р’В¶Р В  Р В РІР‚В¦Р В  Р РЋРІР‚Сћ Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В Р Р‹Р В Р РЏР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ°, Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ°Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В° 3 Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° inv_006.`,
              timestamp: Date.now(),
              cardId: duelCardId,
            },
          });

          await updateDoc(playerRef, {
            lastNotification: {
              message: `Р В  Р Р†Р вЂљРІвЂћСћР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В·Р В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В ${targetPlayer.login} Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°. Р В  Р РЋРІР‚С”Р В  Р вЂ™Р’В¶Р В  Р РЋРІР‚ВР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В  Р РЋР’В Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°.`,
              timestamp: Date.now(),
              cardId: duelCardId,
            },
          });

          logEvent({
            id: `duel_challenge_${card.id}_${Date.now()}`,
            timestamp: Date.now(), type: 'duel',
            message: `${playerData.login} Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В·Р В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» ${targetPlayer.login} Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°.`,
            playerId: user.uid, targetPlayerId: targetPlayer.id, cardId: card.id,
            details: { status: 'pending', canUseProtection: targetHasFishProtection }
          });
          break;
        }

        case "move_target_and_self":
          if (targetRef && targetPlayerId) {
            if (targetHasFish) {
              await updateDoc(targetRef, clearTemporaryStatus);
              notify(`${targetPlayer?.login} Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» Р В Р Р‹Р В Р Р‰Р В Р Р‹Р Р†Р вЂљРЎвЂєР В Р Р‹Р Р†Р вЂљРЎвЂєР В  Р вЂ™Р’ВµР В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р вЂ™ Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ!`, 'warning', targetPlayer.inventory?.find(id => allCards[id]?.action === 'fish_protection')); // Changed from alert
              logEvent({
                id: `move_and_self_blocked_${card.id}_${Date.now()}`,
                timestamp: Date.now(), type: 'status_effect',
                message: `${targetPlayer?.login} Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» Р В Р Р‹Р В Р Р‰Р В Р Р‹Р Р†Р вЂљРЎвЂєР В Р Р‹Р Р†Р вЂљРЎвЂєР В  Р вЂ™Р’ВµР В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ў "Р В  Р РЋРЎСџР В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В Р Р‹Р В Р вЂ°Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ!" Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ў ${playerData.login} Р В Р Р‹Р В РЎвЂњ Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљР’В°Р В Р Р‹Р В Р вЂ°Р В Р Р‹Р В РІР‚в„– Р В  Р вЂ™ Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р РЋРІР‚В.`,
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
            notify("Р В  Р вЂ™Р’В¦Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° 2 Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СњР В  Р РЋРІР‚В, Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚СљР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚ВР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° 1.", 'info', card.id); // Changed from alert
            logEvent({
              id: `move_and_self_${card.id}_${Date.now()}`,
              timestamp: Date.now(), type: 'movement',
              message: `${playerData.login} Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» "Р В  Р РЋРЎСџР В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В Р Р‹Р В Р вЂ°Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ!". ${targetPlayer?.login} Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° 2 Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СњР В  Р РЋРІР‚В, ${playerData.login} Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚СљР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚ВР В  Р вЂ™Р’В» Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° 1.`,
              playerId: user.uid, targetPlayerId: targetPlayer?.id, cardId: card.id,
              details: { selfMove: -1, targetMove: 2 }
            });
          }
          break;

        case "pay_or_move_back":
          {
            // Р В  Р Р†Р вЂљРЎС›Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В Р Р‹Р Р†Р вЂљ Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°, Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° Р В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р Р†РІР‚С›РІР‚вЂњР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р Р†Р вЂљРІвЂћСћР В  Р В Р вЂ№Р В  Р Р†Р вЂљРЎС›Р В  Р СћРЎвЂ™ Р В  Р РЋРІР‚СњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р вЂ™Р’В° (inv_015)
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
                notify(`${tData.login} Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂњР В  Р РЋРІР‚В Р В  Р вЂ™ Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ!`, 'warning');
                continue;
              }

              const actualPRef = hasReflect ? playerRef : tRef;
              const actualRecipientRef = hasReflect ? tRef : playerRef;
              const victimData = hasReflect ? playerData : tData;

              if (hasReflect) await updateDoc(tRef, clearTemporaryStatus);

              const currentCoins = victimData.tiltCoins ?? 0;
              let paymentAmount = card.value;
              let promoCodeUsed = false;

              if (hasPromoCode) {
                paymentAmount = Math.ceil(card.value / 2); // Victim pays half, rounding up
                promoCodeUsed = true;
                await updateDoc(actualPRef, clearTemporaryStatus); // Clear promo code status
                notify(`Р В  Р РЋРЎСџР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р РЋРІР‚ВР В  Р РЋРІР‚Сњ Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»! ${victimData.login} Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р вЂ™Р’В» Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р РЋРІР‚СњР В  Р РЋРІР‚Сћ ${paymentAmount} Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў.`, 'success', card.id);
                logEvent({
                  id: `promo_code_used_taxes_${card.id}_${Date.now()}`,
                  timestamp: Date.now(), type: 'status_effect',
                  message: `${victimData.login} Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» Р В  Р РЋРЎСџР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р РЋРІР‚ВР В  Р РЋРІР‚Сњ Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В Р Р‹Р РЋРІР‚СљР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В Р Р‹Р В Р вЂ°Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂњР В  Р вЂ™Р’В°.`,
                  playerId: victimData.id, cardId: card.id,
                  details: { originalAmount: card.value, finalAmount: paymentAmount }
                });
              }

              if (currentCoins >= paymentAmount) { // Use adjusted paymentAmount
                await runTransaction(db, async (transaction) => {
                  transaction.update(actualPRef, { tiltCoins: increment(-paymentAmount) });
                  transaction.update(actualRecipientRef, { tiltCoins: increment(paymentAmount) });
                });
                if (!promoCodeUsed) notify(`${victimData.login} Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р вЂ™Р’В» ${paymentAmount} Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў.`, 'info');
              } else {
                // Р В  Р Р†Р вЂљРІвЂћСћР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚Сћ Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚СљР В  Р РЋРІР‚вЂќР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ, Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚Сњ Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р РЏР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Gambling Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ
                const gamblingCards = getRandomInteractionCards("gambling");
                const randomMomentalCardId = pickRandom(gamblingCards);
                const randomMomentalCard = randomMomentalCardId ? allCards[randomMomentalCardId] : null;

                if (randomMomentalCard) {
                  await runTransaction(db, async (transaction) => {
                    await applyMomentalCardEffect(victimData, randomMomentalCard, transaction);
                  });
                  notify(`${victimData.login} Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В Р Р‹Р В РЎвЂњР В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂњ Р В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂќР В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂњ Р В  Р РЋРІР‚В Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р РЏР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Gambling Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ "${randomMomentalCard.name}".`, 'warning');
                  logEvent({
                    id: `taxes_gambling_${card.id}_${Date.now()}`,
                    timestamp: Date.now(), type: 'status_effect',
                    message: `${victimData.login} Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В Р Р‹Р В РЎвЂњР В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂњ Р В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂќР В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂњ Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ў ${playerData.login} Р В  Р РЋРІР‚В Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р РЏР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Gambling Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ "${randomMomentalCard.name}".`,
                    playerId: victimData.id, cardId: card.id,
                    details: { reason: 'failed_to_pay_taxes', momentalCardId: randomMomentalCard.id }
                  });
                } else {
                  notify(`${victimData.login} Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В Р Р‹Р В РЎвЂњР В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂњ Р В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂќР В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂњ, Р В  Р В РІР‚В¦Р В  Р РЋРІР‚Сћ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р вЂ° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В  Р Р†РІР‚С›РІР‚вЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚В Gambling Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ.`, 'error');
                }
              }
            }
          }
          break;

        case "take_next_card": {
          const nextPlayerId = getNextPlayerId(user.uid);
          if (!nextPlayerId) {
            notify("Р В  Р РЋРЎС™Р В  Р вЂ™Р’ВµР В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р РЋР’ВР В Р Р‹Р РЋРІР‚Сљ Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р В РІР‚В Р В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РІР‚в„–Р В Р Р‹Р Р†Р вЂљР’В°Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РІР‚в„– Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ.", 'warning', card.id); // Changed from alert
            logEvent({
              id: `take_next_card_fail_${card.id}_${Date.now()}`,
              timestamp: Date.now(), type: 'info',
              message: `${playerData.login} Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В» Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РІР‚в„–Р В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’ВµР В  Р РЋРІР‚вЂњР В  Р РЋРІР‚Сћ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ "Р В  Р Р†Р вЂљР’ВР В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂњР В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°".`,
              playerId: user.uid, cardId: card.id,
              details: { outcome: 'no_next_player' }
            });
            break;
          }
          await updateDoc(doc(db, "players", nextPlayerId), {
            redirectNextDrawnToPlayerId: user.uid,
          });
          notify("Р В  Р В Р вЂ№Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РІР‚в„–Р В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’В°Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РІР‚в„–Р В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’ВµР В  Р РЋРІР‚вЂњР В  Р РЋРІР‚Сћ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В Р Р‹Р РЋРІР‚СљР В  Р Р†РІР‚С›РІР‚вЂњР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р РЋР’В.", 'info', card.id); // Changed from alert
          logEvent({
            id: `take_next_card_${card.id}_${Date.now()}`,
            timestamp: Date.now(), type: 'status_effect',
            message: `${playerData.login} Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» "Р В  Р Р†Р вЂљР’ВР В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂњР В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°". Р В  Р В Р вЂ№Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РІР‚в„–Р В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’В°Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° ${getPlayerById(nextPlayerId)?.login} Р В Р Р‹Р РЋРІР‚СљР В  Р Р†РІР‚С›РІР‚вЂњР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў ${playerData.login}.`,
            playerId: user.uid, targetPlayerId: nextPlayerId, cardId: card.id,
            details: { effect: 'redirect_next_drawn' }
          });
          break;
        }

        case "give_next_card": {
          const nextPlayerId = getNextPlayerId(user.uid);
          if (!nextPlayerId) {
            notify("Р В  Р РЋРЎС™Р В  Р вЂ™Р’ВµР В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р РЋР’ВР В Р Р‹Р РЋРІР‚Сљ Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РІР‚в„–Р В Р Р‹Р Р†Р вЂљР’В°Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РІР‚в„– Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ.", 'warning', card.id); // Changed from alert
            logEvent({
              id: `give_next_card_fail_${card.id}_${Date.now()}`,
              timestamp: Date.now(), type: 'info',
              message: `${playerData.login} Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В» Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РІР‚в„–Р В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’ВµР В  Р РЋРІР‚вЂњР В  Р РЋРІР‚Сћ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ "Р В  Р РЋРЎвЂєР В  Р вЂ™Р’В°Р В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В±Р В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™".`,
              playerId: user.uid, cardId: card.id,
              details: { outcome: 'no_next_player' }
            });
            break;
          }
          await updateDoc(playerRef, { giveNextDrawnToPlayerId: nextPlayerId });
          notify("Р В  Р В Р вЂ№Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РІР‚в„–Р В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’В°Р В Р Р‹Р В Р РЏ Р В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° Р В Р Р‹Р РЋРІР‚СљР В  Р Р†РІР‚С›РІР‚вЂњР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р СћРІР‚ВР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В  Р РЋРІР‚вЂњР В  Р РЋРІР‚СћР В  Р РЋР’ВР В Р Р‹Р РЋРІР‚Сљ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚Сљ.", 'info', card.id); // Changed from alert
          logEvent({
            id: `give_next_card_${card.id}_${Date.now()}`,
            timestamp: Date.now(), type: 'status_effect',
            message: `${playerData.login} Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» "Р В  Р РЋРЎвЂєР В  Р вЂ™Р’В°Р В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В±Р В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™". Р В  Р В Р вЂ№Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РІР‚в„–Р В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’В°Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° ${playerData.login} Р В Р Р‹Р РЋРІР‚СљР В  Р Р†РІР‚С›РІР‚вЂњР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў ${getPlayerById(nextPlayerId)?.login}.`,
            playerId: user.uid, targetPlayerId: nextPlayerId, cardId: card.id,
            details: { effect: 'give_next_drawn' }
          });
          break;
        }

        case "communism":
          if (targetRef && targetPlayerId && targetPlayer) {
            if (targetHasFish) {
              await updateDoc(targetRef, clearTemporaryStatus);
              notify(`${targetPlayer.login} Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» Р В  Р РЋРІвЂћСћР В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р РЋР’ВР В Р Р‹Р РЋРІР‚СљР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В·Р В  Р РЋР’В Р В  Р вЂ™ Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ!`, 'warning');
              break;
            }

            const actualTargetRef = targetHasReflect ? playerRef : targetRef;
            const actualRecipientRef = targetHasReflect ? targetRef : playerRef;
            const victimData = targetHasReflect ? playerData : targetPlayer;
            
            if (targetHasReflect) {
              await updateDoc(targetRef, clearTemporaryStatus);
              notify(`${targetPlayer.login} Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В·Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В» Р В  Р РЋРІвЂћСћР В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р РЋР’ВР В Р Р‹Р РЋРІР‚СљР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В·Р В  Р РЋР’В!`, 'warning');
            }

            // Р В  Р РЋРЎв„ўР В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В  Р РЋР’ВР В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р РЋРІР‚СњР В  Р вЂ™Р’В°: Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚В Р В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В¦Р В  Р РЋРІР‚СћР В  Р РЋР’В Р В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В Р В  Р вЂ™Р’Вµ Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚ВР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р В РІР‚В¦Р В Р Р‹Р В Р РЏР В Р Р‹Р В Р РЏ Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ Р В Р Р‹Р РЋРІР‚Сљ Р В  Р В РІР‚В Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°Р В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В Р Р‹Р Р†Р вЂљ Р В  Р вЂ™Р’В° (victim)
            // Р В  Р РЋРЎС™Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚ВР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™: 7 Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў. 7 / 2 = 3.5 -> Math.floor(3.5) = 3. 
            // Р В  Р Р†Р вЂљРІвЂћСћР В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™ Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў 3, Р В Р Р‹Р РЋРІР‚Сљ Р В  Р вЂ™Р’В¶Р В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ 4.
            const currentVictimCoins = victimData.tiltCoins ?? 0;
            const stealAmount = Math.floor(currentVictimCoins / 2);

            if (stealAmount > 0) {
              await runTransaction(db, async (transaction) => {
                transaction.update(actualTargetRef, { tiltCoins: increment(-stealAmount) });
                transaction.update(actualRecipientRef, { tiltCoins: increment(stealAmount) });
              });
              
              const victimName = targetHasReflect ? "Р В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњ" : targetPlayer.login;
              const getterName = targetHasReflect ? targetPlayer.login : "Р В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњ";
              notify(`Р В  Р вЂ™ Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В·Р В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В» Р В  Р РЋРІР‚ВР В  Р РЋР’ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В Р В  Р вЂ™Р’В°! ${getterName} Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В ${stealAmount} Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ў ${victimName}.`, 'success', card.id);
              
              logEvent({
                id: `communism_${card.id}_${Date.now()}`,
                timestamp: Date.now(), type: 'coin_change',
                message: `${playerData.login} Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» Р В  Р РЋРІвЂћСћР В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р РЋР’ВР В Р Р‹Р РЋРІР‚СљР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В·Р В  Р РЋР’В Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° ${targetPlayer.login}. Р В  Р РЋРЎСџР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚Сћ ${stealAmount} Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў.`,
                playerId: user.uid, targetPlayerId: targetPlayerId, cardId: card.id,
                details: { amount: stealAmount, reflected: targetHasReflect }
              });
            } else {
              notify("Р В  Р В РІвЂљВ¬ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р В РІР‚В¦Р В  Р РЋРІР‚Сћ Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В·Р В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°.", 'info');
            }
          }
          break;
        
        case "promo_code_benefit":
          await updateDoc(playerRef, {
            customStatus: "promo_code_active",
            statusDuration: 1, // Lasts for one "event"
          });
          notify("Р В  Р РЋРЎСџР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р РЋРІР‚ВР В  Р РЋРІР‚Сњ Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦! Р В  Р В Р вЂ№Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РІР‚в„–Р В Р Р‹Р Р†Р вЂљР’В°Р В  Р РЋРІР‚ВР В  Р Р†РІР‚С›РІР‚вЂњ Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎвЂє Р В  Р вЂ™Р’В±Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В Р Р‹Р РЋРІР‚СљР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В Р Р‹Р В Р вЂ°Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦ Р В  Р В РІР‚В Р В  Р СћРІР‚ВР В  Р В РІР‚В Р В  Р РЋРІР‚СћР В  Р вЂ™Р’Вµ.", 'info', card.id);
          logEvent({
            id: `promo_code_activated_${card.id}_${Date.now()}`,
            timestamp: Date.now(), type: 'status_effect',
            message: `${playerData.login} Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» Р В  Р РЋРЎСџР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р РЋРІР‚ВР В  Р РЋРІР‚Сњ.`,
            playerId: user.uid, cardId: card.id,
            details: { status: 'promo_code_active' }
          });
          break;



        default:
          console.warn("Р В  Р Р†Р вЂљРЎСљР В  Р вЂ™Р’ВµР В  Р Р†РІР‚С›РІР‚вЂњР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В·Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В  Р РЋРІР‚Сћ:", card.action);
          notify(`Р В  Р Р†Р вЂљРЎСљР В  Р вЂ™Р’ВµР В  Р Р†РІР‚С›РІР‚вЂњР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ "${card.name}" Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В·Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В  Р РЋРІР‚Сћ.`, 'error', card.id); // Changed from alert
      }
    } catch (e) {
      console.error(e);
      await updateDoc(playerRef, { inventory: arrayUnion(card.id) }).catch((restoreError) => {
        console.error("Р В  Р РЋРЎС™Р В  Р вЂ™Р’Вµ Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р вЂ° Р В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р В РІР‚В¦Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚СћР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р РЋРІР‚В:", restoreError);
      });
      await updateDoc(doc(db, "gameState", "current"), { revealedCards: arrayRemove(card.id) }).catch((restoreError) => {
        console.error("Р В  Р РЋРЎС™Р В  Р вЂ™Р’Вµ Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р вЂ° Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В· revealedCards Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚СћР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р РЋРІР‚В:", restoreError);
      });
      notify(`Р В  Р РЋРЎСџР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚ВР В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚СћР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚В Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р РЋРІР‚В Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ "${card.name}".`, 'error', card.id); // Changed from alert
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

  // Р В  Р Р†Р вЂљРІвЂћСћР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂњР В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В Р Р‹Р В Р РЏ Р В Р Р‹Р Р†Р вЂљРЎвЂєР В Р Р‹Р РЋРІР‚СљР В  Р В РІР‚В¦Р В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљ Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ (Р В  Р РЋРІвЂћСћР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ў-Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В Р Р‹Р Р†РІР‚С™Р’В¬, Р В  Р Р†Р вЂљР’ВР В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂњР В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°, Р В  Р РЋРЎвЂєР В  Р вЂ™Р’В°Р В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В±Р В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™)
  const handleDrawnCardDistribution = useCallback(
    async (
      player: Player,
      card: GameCard,
      transaction: any,
    ) => {
      const playerRef = doc(db, "players", player.id);
      let suppressCard = false;
      let finalRecipientRef = playerRef;

      if (player.discardNextDrawn) {
        suppressCard = true;
        transaction.update(playerRef, { discardNextDrawn: false });
        notify(`Р В  Р Р†Р вЂљРІвЂћСћР В  Р вЂ™Р’В°Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° "Р В  Р РЋРІвЂћСћР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ў-Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В Р Р‹Р Р†РІР‚С™Р’В¬" Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°. Р В  Р РЋРІвЂћСћР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° "${card.name}" Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р вЂ™Р’В°.`, 'info', card.id);
        logEvent({
          id: `card_discarded_by_effect_${card.id}_${Date.now()}`,
          timestamp: Date.now(), type: 'card_play',
          message: `${player.login} Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚ВР В  Р вЂ™Р’В» Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ "${card.name}" Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В·-Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В° Р В Р Р‹Р В Р Р‰Р В Р Р‹Р Р†Р вЂљРЎвЂєР В Р Р‹Р Р†Р вЂљРЎвЂєР В  Р вЂ™Р’ВµР В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° "Р В  Р РЋРІвЂћСћР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ў-Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В Р Р‹Р Р†РІР‚С™Р’В¬".`,
          playerId: player.id, cardId: card.id,
          details: { reason: 'discard_next_drawn' }
        });
      } else if (player.redirectNextDrawnToPlayerId) {
        finalRecipientRef = doc(db, "players", player.redirectNextDrawnToPlayerId);
        transaction.update(playerRef, { redirectNextDrawnToPlayerId: null });
        notify(`Р В  Р РЋРІвЂћСћР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° "${card.name}" Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р В РІР‚В Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚Сљ ${getPlayerById(player.redirectNextDrawnToPlayerId)?.login}.`, 'info', card.id);
      } else if (player.giveNextDrawnToPlayerId) {
        finalRecipientRef = doc(db, "players", player.giveNextDrawnToPlayerId);
        transaction.update(playerRef, { giveNextDrawnToPlayerId: null });
        notify(`Р В  Р РЋРІвЂћСћР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° "${card.name}" Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚Сљ ${getPlayerById(player.giveNextDrawnToPlayerId)?.login}.`, 'info', card.id);
      }

      if (!suppressCard) {
        transaction.update(finalRecipientRef, { inventory: arrayUnion(card.id) });
      }
    },
    [notify, logEvent, getPlayerById]
  );

  const handleSelectOpponentCard = async (targetPlayerId: string, cardId: string) => {
    if (!user || !playerData) return;

    // --- START: Golden Card Protection (inv_018) ---
    if (cardId === "inv_018") {
      notify("Р В  Р Р†Р вЂљРІР‚СњР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РІР‚в„– Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р вЂ™Р’В·Р В Р Р‹Р В Р РЏ Р В Р Р‹Р РЋРІР‚СљР В  Р РЋРІР‚СњР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ°!", 'warning', cardId);
      logEvent({
        id: `golden_card_protection_${cardId}_${Date.now()}`,
        timestamp: Date.now(), type: 'warning',
        message: `${playerData.login} Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂќР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ Р В Р Р‹Р РЋРІР‚СљР В  Р РЋРІР‚СњР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ°/Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В  Р Р†Р вЂљРІР‚СњР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РІР‚в„– Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ Р В Р Р‹Р РЋРІР‚Сљ ${getPlayerById(targetPlayerId)?.login}, Р В  Р В РІР‚В¦Р В  Р РЋРІР‚Сћ Р В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР’В°Р В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р вЂ™Р’В°.`,
        playerId: user.uid, targetPlayerId: targetPlayerId, cardId: cardId,
        details: { action: 'steal_or_discard', outcome: 'blocked' }
      });
      await updateDoc(doc(db, "gameState", "current"), { activeInteraction: null }); // Р В  Р Р†Р вЂљРІР‚СњР В  Р вЂ™Р’В°Р В  Р РЋРІР‚СњР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В  Р РЋР’В Р В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљ Р В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚в„–
      return;
    }
    // --- END: Golden Card Protection ---

    if (!user || !playerData) return;

    console.log("Р В  Р Р†Р вЂљРІР‚СњР В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂќР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚Сњ handleSelectOpponentCard Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ:", targetPlayerId, "Р В  Р РЋРІвЂћСћР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°:", cardId);
    const targetRef = doc(db, "players", targetPlayerId);
    const cardName = allCards[cardId]?.name || "Р В  Р РЋРЎС™Р В  Р вЂ™Р’ВµР В  Р РЋРІР‚ВР В  Р вЂ™Р’В·Р В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°";
    const actingCardId = gameState.activeInteraction?.actingCardId;

    try {
      await runTransaction(db, async (transaction) => {
        const gsRef = doc(db, "gameState", "current");
        const gsSnap = await transaction.get(gsRef);
        if (!gsSnap.exists()) return;

        const interaction = (gsSnap.data() as GameState).activeInteraction;
        const isSteal = interaction?.actingCardId === "inv_011";
        const recipientId = interaction?.recipientId;

        // 1. Р В  Р В РІвЂљВ¬Р В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’ВµР В  Р РЋР’В Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ Р В Р Р‹Р РЋРІР‚Сљ Р В Р Р‹Р Р†Р вЂљ Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В
        transaction.update(targetRef, {
          inventory: arrayRemove(cardId),
          // Р В  Р Р†Р вЂљРЎСљР В  Р РЋРІР‚СћР В  Р вЂ™Р’В±Р В  Р вЂ™Р’В°Р В  Р В РІР‚В Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’ВµР В  Р РЋР’В Р В Р Р‹Р РЋРІР‚СљР В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р вЂ™Р’Вµ, Р В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р вЂ™Р’Вµ UI Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В Р Р‹Р Р†Р вЂљ Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р вЂ™Р’В¶Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ°
          lastNotification: {
            message: isSteal 
              ? `Р В  Р вЂ™Р’ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚Сњ "${playerData.login}" Р В Р Р‹Р РЋРІР‚СљР В  Р РЋРІР‚СњР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» Р В Р Р‹Р РЋРІР‚Сљ Р В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ "${cardName}"`
              : `Р В  Р вЂ™Р’ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚Сњ "${playerData.login}" Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В· Р В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’ВµР В  Р РЋРІР‚вЂњР В  Р РЋРІР‚Сћ Р В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ "${cardName}"`,
            timestamp: Date.now(),
            cardId: cardId
          }
        });

        // 2. Р В  Р Р†Р вЂљРЎС›Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В Р Р‹Р В Р Р‰Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚Сћ Р В  Р РЋРІР‚СњР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В¶Р В  Р вЂ™Р’В° (11 Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°), Р В  Р СћРІР‚ВР В  Р РЋРІР‚СћР В  Р вЂ™Р’В±Р В  Р вЂ™Р’В°Р В  Р В РІР‚В Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’ВµР В  Р РЋР’В Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В Р Р‹Р В РІР‚в„–
        if (isSteal && recipientId) {
          const recipientRef = doc(db, "players", recipientId);
          transaction.update(recipientRef, {
            inventory: arrayUnion(cardId)
          });
        }

        // 3. Р В  Р Р†Р вЂљРІР‚СњР В  Р вЂ™Р’В°Р В  Р РЋРІР‚СњР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В  Р РЋР’В Р В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р В РІР‚В  Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°
        transaction.update(gsRef, {
          activeInteraction: null
        });

        // 4. Р В  Р Р†Р вЂљРЎСљР В  Р РЋРІР‚СћР В  Р вЂ™Р’В±Р В  Р вЂ™Р’В°Р В  Р В РІР‚В Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’ВµР В  Р РЋР’В Р В  Р В РІР‚В  Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚в„– Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В·Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р Р‹Р Р†Р вЂљР’В¦ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ў
        transaction.update(gsRef, {
          revealedCards: arrayUnion(cardId)
        });
      });
    } catch (e) {
      console.error("Р В  Р РЋРІР‚С”Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚В Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р РЋРІР‚В Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р РЋРІР‚СњР В  Р вЂ™Р’В°:", e);
      if (actingCardId) {
        await updateDoc(doc(db, "players", user.uid), { inventory: arrayUnion(actingCardId) }).catch((restoreError) => {
          console.error("Р В  Р РЋРЎС™Р В  Р вЂ™Р’Вµ Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р вЂ° Р В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р В РІР‚В¦Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚СћР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р РЋРІР‚В:", restoreError);
        });
        await updateDoc(doc(db, "gameState", "current"), {
          activeInteraction: null,
          revealedCards: arrayRemove(actingCardId),
        }).catch((restoreError) => {
          console.error("Р В  Р РЋРЎС™Р В  Р вЂ™Р’Вµ Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р вЂ° Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚СњР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚СћР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р РЋРІР‚В:", restoreError);
        });
      }
      notify("Р В  Р РЋРЎС™Р В  Р вЂ™Р’Вµ Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р вЂ° Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ. Р В  Р РЋРЎСџР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р Р‹Р В Р вЂ°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р В РІР‚В Р В  Р вЂ™Р’В° Р В  Р СћРІР‚ВР В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚СљР В  Р РЋРІР‚вЂќР В  Р вЂ™Р’В° Р В  Р В РІР‚В  Р В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Firebase.", 'error'); // Changed from alert
      logEvent({
        id: `select_opponent_card_error_${Date.now()}`,
        timestamp: Date.now(), type: 'error',
        message: `Р В  Р РЋРІР‚С”Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚В Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р РЋРІР‚В Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р РЋРІР‚СњР В  Р вЂ™Р’В°: ${e instanceof Error ? e.message : String(e)}.`,
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
          throw new Error("Р В  Р В РІвЂљВ¬ Р В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р В РІР‚В¦Р В  Р РЋРІР‚Сћ Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂќР В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ.");
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
            message: `Р В  Р Р†Р вЂљРІвЂћСћР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В Р Р‹Р РЋРІР‚СљР В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р В РІР‚В Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’Вµ Р В Р Р‹Р Р†Р вЂљРЎвЂєР В  Р РЋРІР‚ВР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р вЂ™Р’В° "${getPlayerById(targetPlayerId)?.login ?? "Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚Сњ"}" Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° ${steps} Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂњ(Р В  Р РЋРІР‚СћР В  Р В РІР‚В ) Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ "${card.name}".`,
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
      console.error("Р В  Р РЋРІР‚С”Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚В Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В¶Р В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р РЋРІР‚В Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В° Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“:", e);
      await updateDoc(playerRef, { inventory: arrayUnion(card.id) }).catch((restoreError) => {
        console.error("Р В  Р РЋРЎС™Р В  Р вЂ™Р’Вµ Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р вЂ° Р В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р В РІР‚В¦Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В  Р РЋРІвЂћСћР В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В  Р РЋРІР‚вЂќР В Р Р‹Р Р†Р вЂљ Р В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚в„– Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚СћР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р РЋРІР‚В:", restoreError);
      });
      await updateDoc(gameStateRef, {
        activeInteraction: null,
        revealedCards: arrayRemove(card.id),
      }).catch((restoreError) => {
        console.error("Р В  Р РЋРЎС™Р В  Р вЂ™Р’Вµ Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р вЂ° Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚СњР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В  Р РЋРІвЂћСћР В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В  Р РЋРІР‚вЂќР В Р Р‹Р Р†Р вЂљ Р В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚в„– Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚СћР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р РЋРІР‚В:", restoreError);
      });
      notify(e.message || "Р В  Р РЋРЎСџР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚ВР В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚СћР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚В Р В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂќР В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ.", 'error'); // Changed from alert
      logEvent({
        id: `confirm_move_for_coins_error_${Date.now()}`,
        timestamp: Date.now(), type: 'error',
        message: `Р В  Р РЋРІР‚С”Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚В Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В¶Р В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р РЋРІР‚В Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В° Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“: ${e.message || "Р В  Р РЋРЎС™Р В  Р вЂ™Р’ВµР В  Р РЋРІР‚ВР В  Р вЂ™Р’В·Р В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚СћР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°"}.`,
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
        // 1. Р В  Р Р†Р вЂљРІвЂћСћР В  Р РЋРІР‚СћР В  Р вЂ™Р’В·Р В  Р В РІР‚В Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В  Р РЋР’В Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚Сљ, Р В  Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В Р Р‹Р В Р Р‰Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚Сћ Р В  Р вЂ™Р’В±Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’В° discard_selection, steal_card, or move_for_coins_selection
        if (actingCardId) {
          transaction.update(playerRef, { inventory: arrayUnion(actingCardId) });
          transaction.update(gsRef, { revealedCards: arrayRemove(actingCardId) });
        }
        // 2. Р В  Р Р†Р вЂљРІР‚СњР В  Р вЂ™Р’В°Р В  Р РЋРІР‚СњР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В  Р РЋР’В Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р В РІР‚В¦Р В  Р РЋРІР‚Сћ Р В  Р В РІР‚В Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚ВР В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р Р†РІР‚С›РІР‚вЂњР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ
        transaction.update(gsRef, { activeInteraction: null });
      });
    } catch (e) {
      console.error("Р В  Р РЋРІР‚С”Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚В Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р Р†РІР‚С›РІР‚вЂњР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ:", e);
      notify("Р В  Р РЋРЎСџР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚ВР В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚СћР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚В Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р Р†РІР‚С›РІР‚вЂњР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ.", 'error');
      logEvent({
        id: `cancel_interaction_error_${Date.now()}`,
        timestamp: Date.now(), type: 'error',
        message: `Р В  Р РЋРІР‚С”Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚В Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р Р†РІР‚С›РІР‚вЂњР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ: ${e instanceof Error ? e.message : String(e)}.`,
        playerId: user.uid, cardId: actingCardId,
      });
    }
  };

  const handleDuelChallengeResponse = async (duelId: string, response: 'accept' | 'use_protection' | 'decline') => {
    if (!user || !playerData) return;

    const gameStateRef = doc(db, "gameState", "current");
    const playerRef = doc(db, "players", user.uid); // Р В  Р вЂ™Р’В¦Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р В РІР‚В Р В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚Сњ (Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚в„–Р В Р Р‹Р Р†Р вЂљР’В°Р В  Р РЋРІР‚ВР В  Р Р†РІР‚С›РІР‚вЂњ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В  Р В РІР‚В )
    const duelState = gameState.activeDuels[duelId];

    if (!duelState || duelState.targetId !== user.uid) {
      console.error("Р В  Р РЋРЎС™Р В  Р вЂ™Р’ВµР В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В Р Р‹Р В Р РЏ Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ° Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚Сњ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В Р Р‹Р В Р РЏР В  Р В РІР‚В Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ Р В Р Р‹Р Р†Р вЂљ Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В Р Р‹Р В РІР‚в„–.");
      return;
    }

    const challengerPlayer = getPlayerById(duelState.challengerId);
    const duelCard = allCards[gameState.activeInteraction?.actingCardId || '']; // inv_015

    try {
      await runTransaction(db, async (transaction) => {
        const currentGameState = (await transaction.get(gameStateRef)).data() as GameState;
        const currentDuelState = currentGameState.activeDuels[duelId];

        if (!currentDuelState) {
          throw new Error("Р В  Р Р†Р вЂљРЎСљР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В  Р Р†РІР‚С›РІР‚вЂњР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р В РІР‚В  Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р В РІР‚В Р В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р Р‹Р Р†Р вЂљР’В¦ Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏР В Р Р‹Р Р†Р вЂљР’В¦.");
        }

        const responseTimestamp = Date.now();

        if (response === 'decline') {
          const challengerRef = doc(db, "players", currentDuelState.challengerId);
          const targetSnap = await transaction.get(playerRef);
          const targetCoins = targetSnap.data()?.tiltCoins ?? 0;
          const declineFee = 3;

          if (targetCoins < declineFee) {
            throw new Error("Р В  Р РЋРЎС™Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р В РІР‚В¦Р В  Р РЋРІР‚Сћ Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В. Р В  Р РЋРЎС™Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В¶Р В  Р В РІР‚В¦Р В  Р РЋРІР‚Сћ 3 Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“.");
          }

          const updatedActiveDuels = { ...currentGameState.activeDuels };
          delete updatedActiveDuels[duelId];

          transaction.update(playerRef, {
            tiltCoins: increment(-declineFee),
            lastNotification: {
              message: `Р В  Р Р†Р вЂљРІвЂћСћР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р вЂ° Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р РЋРІР‚В Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В ${declineFee} Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“.`,
              timestamp: responseTimestamp,
              cardId: duelCard?.id,
            },
          });
          transaction.update(challengerRef, { tiltCoins: increment(declineFee) });
          transaction.update(gameStateRef, {
            activeDuels: updatedActiveDuels,
            activeInteraction: null,
            [`notifications.${currentDuelState.challengerId}`]: {
              message: `${playerData.login} Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р РЋРІР‚В Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р вЂ™Р’В» Р В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р РЋР’В ${declineFee} Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“.`,
              timestamp: responseTimestamp,
              cardId: duelCard?.id,
            },
          });
          logEvent({
            id: `duel_declined_${duelId}_${Date.now()}`,
            timestamp: Date.now(), type: 'duel',
            message: `${playerData.login} Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В Р Р‹Р В РЎвЂњ ${challengerPlayer?.login} Р В  Р РЋРІР‚В Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р вЂ™Р’В» ${declineFee} Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“.`,
            playerId: user.uid, targetPlayerId: challengerPlayer?.id, cardId: duelCard?.id,
            details: { outcome: 'declined', fee: declineFee }
          });
        } else if (response === 'use_protection') {
          // Р В  Р вЂ™Р’В¦Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ° Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р вЂ™Р’В·Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў inv_006
          const protectionCardId = "inv_006";
          if (!playerData.inventory?.includes(protectionCardId)) {
            throw new Error("Р В  Р В РІвЂљВ¬ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў inv_006 Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ.");
          }

          // Р В  Р В РІвЂљВ¬Р В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’ВµР В  Р РЋР’В inv_006 Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В· Р В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р В Р РЏ Р В Р Р‹Р Р†Р вЂљ Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В
          transaction.update(playerRef, { inventory: arrayRemove(protectionCardId) });
          // Р В  Р Р†Р вЂљРЎСљР В  Р РЋРІР‚СћР В  Р вЂ™Р’В±Р В  Р вЂ™Р’В°Р В  Р В РІР‚В Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’ВµР В  Р РЋР’В inv_006 Р В  Р В РІР‚В  Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚СњР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“
          transaction.update(gameStateRef, { revealedCards: arrayUnion(protectionCardId) });

          // Р В  Р В РІвЂљВ¬Р В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’ВµР В  Р РЋР’В Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ° Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В· activeDuels
          const updatedActiveDuels = { ...currentGameState.activeDuels };
          delete updatedActiveDuels[duelId];
          transaction.update(gameStateRef, { activeDuels: updatedActiveDuels });

          // Р В  Р РЋРІР‚С”Р В Р Р‹Р Р†Р вЂљР Р‹Р В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В  Р РЋР’В Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р В РІР‚В Р В  Р В РІР‚В¦Р В  Р РЋРІР‚СћР В  Р вЂ™Р’Вµ Р В  Р В РІР‚В Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚ВР В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р Р†РІР‚С›РІР‚вЂњР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В  Р вЂ™Р’Вµ
          transaction.update(gameStateRef, { activeInteraction: null });

          // Р В  Р В РІвЂљВ¬Р В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’ВµР В  Р РЋР’В Р В  Р РЋРІР‚СћР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СћР В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљР’В¦ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р В РІР‚В 
          transaction.update(playerRef, {
            lastNotification: {
              message: `Р В  Р Р†Р вЂљРІвЂћСћР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р В РІР‚В¦Р В  Р РЋРІР‚Сћ Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В·Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В¶Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В, Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р В РІР‚В  Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ "No, no, no mr. Fish"!`,
              timestamp: responseTimestamp,
              cardId: protectionCardId
            }
          });
          logEvent({
            id: `duel_avoided_${duelId}_${Date.now()}`,
            timestamp: Date.now(), type: 'duel',
            message: `${playerData.login} Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В·Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В¶Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В Р Р‹Р В РЎвЂњ ${challengerPlayer?.login} Р В Р Р‹Р В РЎвЂњ Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљР’В°Р В Р Р‹Р В Р вЂ°Р В Р Р‹Р В РІР‚в„– Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ "No, no, no mr. Fish".`,
            playerId: user.uid, targetPlayerId: challengerPlayer?.id, cardId: protectionCardId,
            details: { outcome: 'avoided' }
          });

          transaction.update(gameStateRef, {
            [`notifications.${currentDuelState.challengerId}`]: {
              message: `${playerData.login} Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В·Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В¶Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В, Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р В РІР‚В  Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ "No, no, no mr. Fish"! Р В  Р Р†Р вЂљРІвЂћСћР В  Р вЂ™Р’В°Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° "Р В  Р Р†Р вЂљРЎСљР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°" Р В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂњР В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°.`,
              timestamp: responseTimestamp,
              cardId: duelCard?.id
            }
          });
        } else { // response === 'accept'
          // Р В  Р вЂ™Р’В¦Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р РЋР’ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў, Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В¦Р В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р РЋРІР‚ВР В  Р РЋР’В Р В  Р РЋРІР‚Сњ Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚Сљ Р В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В¶Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ
          transaction.update(gameStateRef, {
            [`activeDuels.${duelId}.status`]: 'accepted',
            activeInteraction: {
              playerId: currentDuelState.targetId, // Р В  Р вЂ™Р’В¦Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ° Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚ВР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В¶Р В  Р РЋРІР‚ВР В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р В РІР‚В Р В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ
              type: "duel_weapon_selection",
              duelId: duelId,
              cards: [],
              targetPlayerId: currentDuelState.targetId,
              actingCardId: duelCard?.id,
            },
            [`notifications.${currentDuelState.challengerId}`]: {
              message: `${playerData.login} Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’В» Р В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†РІР‚С™Р’В¬ Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В  Р В РІР‚В  Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°! Р В  Р Р†Р вЂљРІвЂћСћР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В¶Р В  Р РЋРІР‚ВР В  Р вЂ™Р’Вµ.`,
              timestamp: responseTimestamp,
              cardId: duelCard?.id
            },
          });

          // Р В  Р В РІвЂљВ¬Р В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В  Р СћРІР‚ВР В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’ВµР В  Р РЋР’В Р В  Р РЋРІР‚СћР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СћР В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљР’В¦ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р В РІР‚В 
          transaction.update(playerRef, {
            lastNotification: {
              message: `Р В  Р Р†Р вЂљРІвЂћСћР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В  Р В РІР‚В  Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ° Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ў ${challengerPlayer?.login}! Р В  Р РЋРІР‚С”Р В  Р вЂ™Р’В¶Р В  Р РЋРІР‚ВР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р Р†РІР‚С›РІР‚вЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’Вµ Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В¶Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ.`,
              timestamp: responseTimestamp,
              cardId: duelCard?.id
            }
          });
          logEvent({
            id: `duel_accepted_${duelId}_${Date.now()}`,
            timestamp: Date.now(), type: 'duel',
            message: `${playerData.login} Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’В» Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В  Р В РІР‚В  Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ° Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ў ${challengerPlayer?.login}.`,
            playerId: user.uid, targetPlayerId: challengerPlayer?.id, cardId: duelCard?.id,
            details: { outcome: 'accepted' }
          });
        }
      });
    } catch (e: any) {
      console.error("Р В  Р РЋРІР‚С”Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚В Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’Вµ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В  Р В РІР‚В  Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В:", e);
      notify(e.message || "Р В  Р РЋРЎСџР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚ВР В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚СћР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚В Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’Вµ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°.", 'error'); // Changed from alert
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
        const normalizedBet = Math.floor(Number(betAmount));

        if (!duel) throw new Error("Р В РІР‚СњР РЋРЎвЂњР РЋР РЉР В Р’В»Р РЋР Р‰ Р В Р вЂ¦Р В Р’Вµ Р В Р вЂ¦Р В Р’В°Р В РІвЂћвЂ“Р В РўвЂР В Р’ВµР В Р вЂ¦Р В Р’В°.");
        if (duel.status !== 'betting') throw new Error("Р В РІР‚СњР РЋРЎвЂњР РЋР РЉР В Р’В»Р РЋР Р‰ Р В Р вЂ¦Р В Р’Вµ Р В Р вЂ¦Р В Р’В°Р РЋРІР‚В¦Р В РЎвЂўР В РўвЂР В РЎвЂР РЋРІР‚С™Р РЋР С“Р РЋР РЏ Р В Р вЂ¦Р В Р’В° Р РЋР РЉР РЋРІР‚С™Р В Р’В°Р В РЎвЂ”Р В Р’Вµ Р РЋР С“Р РЋРІР‚С™Р В Р’В°Р В Р вЂ Р В РЎвЂўР В РЎвЂќ.");
        if (normalizedBet <= 0) throw new Error("Р В Р Р‹Р РЋРІР‚С™Р В Р’В°Р В Р вЂ Р В РЎвЂќР В Р’В° Р В РўвЂР В РЎвЂўР В Р’В»Р В Р’В¶Р В Р вЂ¦Р В Р’В° Р В Р’В±Р РЋРІР‚в„–Р РЋРІР‚С™Р РЋР Р‰ Р В Р’В±Р В РЎвЂўР В Р’В»Р РЋР Р‰Р РЋРІвЂљВ¬Р В Р’Вµ 0.");

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
              [`notifications.${duel.challengerId}`]: {
                message: `Р В Р Р‹Р РЋРІР‚С™Р В Р’В°Р В Р вЂ Р В РЎвЂќР В РЎвЂ Р РЋР С“Р В РўвЂР В Р’ВµР В Р’В»Р В Р’В°Р В Р вЂ¦Р РЋРІР‚в„–. Р В Р Р‹Р РЋРІР‚в„–Р В РЎвЂ“Р РЋР вЂљР В Р’В°Р В РІвЂћвЂ“Р РЋРІР‚С™Р В Р’Вµ Р В РЎВР В РЎвЂР В Р вЂ¦Р В РЎвЂ-Р В РЎвЂР В РЎвЂ“Р РЋР вЂљР РЋРЎвЂњ Р В Р вЂ Р В Р вЂ¦Р В Р’Вµ Р В РЎвЂ”Р В РЎвЂўР В Р’В»Р РЋР РЏ, Р В Р’В·Р В Р’В°Р РЋРІР‚С™Р В Р’ВµР В РЎВ Р В Р’В°Р В РўвЂР В РЎВР В РЎвЂР В Р вЂ¦ Р В Р вЂ Р В Р вЂ¦Р В Р’ВµР РЋР С“Р В Р’ВµР РЋРІР‚С™ Р В РЎвЂ”Р В РЎвЂўР В Р’В±Р В Р’ВµР В РўвЂР В РЎвЂР РЋРІР‚С™Р В Р’ВµР В Р’В»Р РЋР РЏ.`,
                timestamp: Date.now(),
              },
              [`notifications.${duel.targetId}`]: {
                message: `Р В Р Р‹Р РЋРІР‚С™Р В Р’В°Р В Р вЂ Р В РЎвЂќР В РЎвЂ Р РЋР С“Р В РўвЂР В Р’ВµР В Р’В»Р В Р’В°Р В Р вЂ¦Р РЋРІР‚в„–. Р В Р Р‹Р РЋРІР‚в„–Р В РЎвЂ“Р РЋР вЂљР В Р’В°Р В РІвЂћвЂ“Р РЋРІР‚С™Р В Р’Вµ Р В РЎВР В РЎвЂР В Р вЂ¦Р В РЎвЂ-Р В РЎвЂР В РЎвЂ“Р РЋР вЂљР РЋРЎвЂњ Р В Р вЂ Р В Р вЂ¦Р В Р’Вµ Р В РЎвЂ”Р В РЎвЂўР В Р’В»Р РЋР РЏ, Р В Р’В·Р В Р’В°Р РЋРІР‚С™Р В Р’ВµР В РЎВ Р В Р’В°Р В РўвЂР В РЎВР В РЎвЂР В Р вЂ¦ Р В Р вЂ Р В Р вЂ¦Р В Р’ВµР РЋР С“Р В Р’ВµР РЋРІР‚С™ Р В РЎвЂ”Р В РЎвЂўР В Р’В±Р В Р’ВµР В РўвЂР В РЎвЂР РЋРІР‚С™Р В Р’ВµР В Р’В»Р РЋР РЏ.`,
                timestamp: Date.now(),
              },
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
            [`notifications.${otherPlayerId}`]: {
              message: `${player.login} Р РЋР С“Р В РўвЂР В Р’ВµР В Р’В»Р В Р’В°Р В Р’В» Р РЋР С“Р РЋРІР‚С™Р В Р’В°Р В Р вЂ Р В РЎвЂќР РЋРЎвЂњ Р В Р вЂ  Р В РўвЂР РЋРЎвЂњР РЋР РЉР В Р’В»Р В РЎвЂ. Р В РЎС›Р В Р’ВµР В РЎвЂ”Р В Р’ВµР РЋР вЂљР РЋР Р‰ Р В Р вЂ Р В Р’В°Р РЋРІвЂљВ¬ Р РЋРІР‚В¦Р В РЎвЂўР В РўвЂ!`,
              timestamp: Date.now(),
            }
          });
        }
      });
    } catch (e: any) {
      console.error("Р В РЎвЂєР РЋРІвЂљВ¬Р В РЎвЂР В Р’В±Р В РЎвЂќР В Р’В° Р В РЎвЂ”Р РЋР вЂљР В РЎвЂ Р РЋР вЂљР В Р’В°Р В Р’В·Р В РЎВР В Р’ВµР РЋРІР‚В°Р В Р’ВµР В Р вЂ¦Р В РЎвЂР В РЎвЂ Р РЋР С“Р РЋРІР‚С™Р В Р’В°Р В Р вЂ Р В РЎвЂќР В РЎвЂ Р В Р вЂ  Р В РўвЂР РЋРЎвЂњР РЋР РЉР В Р’В»Р В РЎвЂ:", e);
      notify(e.message || "Р В РЎСџР РЋР вЂљР В РЎвЂўР В РЎвЂР В Р’В·Р В РЎвЂўР РЋРІвЂљВ¬Р В Р’В»Р В Р’В° Р В РЎвЂўР РЋРІвЂљВ¬Р В РЎвЂР В Р’В±Р В РЎвЂќР В Р’В° Р В РЎвЂ”Р РЋР вЂљР В РЎвЂ Р РЋР вЂљР В Р’В°Р В Р’В·Р В РЎВР В Р’ВµР РЋРІР‚В°Р В Р’ВµР В Р вЂ¦Р В РЎвЂР В РЎвЂ Р РЋР С“Р РЋРІР‚С™Р В Р’В°Р В Р вЂ Р В РЎвЂќР В РЎвЂ.", 'error');
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

        if (!duel) throw new Error("Р В  Р Р†Р вЂљРЎСљР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В  Р Р†РІР‚С›РІР‚вЂњР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р вЂ™Р’В°.");
        if (duel.status !== 'ready_to_roll') throw new Error("Р В  Р Р†Р вЂљРЎСљР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР’В¦Р В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ Р В  Р В РІР‚В  Р В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В Р Р‹Р В Р РЏР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р РЋРІР‚В Р В  Р РЋРІР‚вЂњР В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р В РІР‚В¦Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚В.");
        if (duel.challengerId !== user.uid) throw new Error("Р В  Р РЋРЎвЂєР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р РЋРІР‚СњР В  Р РЋРІР‚Сћ Р В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљ Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™ Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р вЂ™Р’В¶Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В Р вЂ° Р В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚СћР В  Р РЋРІР‚Сњ.");

        if (duel.weapon === 'dice') {
          const challengerRoll = rollD6();
          const targetRoll = rollD6();
          transaction.update(gameStateRef, {
            [`activeDuels.${duelId}.status`]: 'rolling',
            [`activeDuels.${duelId}.rolls`]: {
              [duel.challengerId]: challengerRoll,
              [duel.targetId]: targetRoll,
            },
            activeInteraction: null, // Р В  Р РЋРІР‚С”Р В Р Р‹Р Р†Р вЂљР Р‹Р В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В  Р РЋР’В Р В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р В РІР‚В , Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р РЋР’ВР В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљ Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В±Р В  Р РЋРІР‚ВР В  Р РЋРІР‚СњР В  Р РЋРІР‚СћР В  Р В РІР‚В 
          });
        } else {
          transaction.update(gameStateRef, {
            [`activeDuels.${duelId}.status`]: 'admin_wait',
            activeInteraction: null, // Р В  Р РЋРІР‚С”Р В  Р вЂ™Р’В¶Р В  Р РЋРІР‚ВР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В  Р РЋР’В Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ Р В  Р вЂ™Р’В°Р В  Р СћРІР‚ВР В  Р РЋР’ВР В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В  Р вЂ™Р’В°
          });
        }
      });
    } catch (e) {
      console.error("Р В  Р РЋРІР‚С”Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚В Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’Вµ Р В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В:", e);
      notify("Р В  Р РЋРЎСџР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚ВР В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚СћР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚В Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’Вµ Р В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В.", 'error');
      logEvent({
        id: `duel_roll_start_error_${duelId}_${Date.now()}`,
        timestamp: Date.now(), type: 'error',
        message: `Р В  Р РЋРІР‚С”Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚В Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’Вµ Р В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В: ${e instanceof Error ? e.message : String(e)}.`,
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

        if (!duel) throw new Error("Р В  Р Р†Р вЂљРЎСљР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ° Р В  Р В РІР‚В¦Р В  Р вЂ™Р’Вµ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В  Р Р†РІР‚С›РІР‚вЂњР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р вЂ™Р’В°.");

        // Р В  Р РЋРІР‚С”Р В  Р вЂ™Р’В±Р В  Р В РІР‚В¦Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’ВµР В  Р РЋР’В Р В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В¶Р В  Р РЋРІР‚ВР В  Р вЂ™Р’Вµ Р В  Р В РІР‚В  Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’ВµР В  Р Р†РІР‚С›РІР‚вЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’Вµ Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р РЋРІР‚В Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В¦Р В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р РЋРІР‚ВР В  Р РЋР’В Р В  Р РЋРІР‚Сњ Р В Р Р‹Р В Р Р‰Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂќР В Р Р‹Р РЋРІР‚Сљ Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В  Р В РІР‚В Р В  Р РЋРІР‚СћР В  Р РЋРІР‚Сњ
        transaction.update(gameStateRef, {
          [`activeDuels.${duelId}.weapon`]: weapon,
          [`activeDuels.${duelId}.status`]: 'betting', // Р В  Р РЋРЎСџР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В¦Р В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р РЋРІР‚ВР В  Р РЋР’В Р В  Р РЋРІР‚Сњ Р В Р Р‹Р В Р Р‰Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂќР В Р Р‹Р РЋРІР‚Сљ Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В  Р В РІР‚В Р В  Р РЋРІР‚СћР В  Р РЋРІР‚Сњ
          // Р В  Р РЋРЎСџР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р РЋРІР‚СњР В  Р вЂ™Р’В»Р В Р Р‹Р В РІР‚в„–Р В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’ВµР В  Р РЋР’В Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р В РІР‚В Р В  Р В РІР‚В¦Р В  Р РЋРІР‚СћР В  Р вЂ™Р’Вµ Р В  Р В РІР‚В Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚ВР В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р Р†РІР‚С›РІР‚вЂњР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В  Р вЂ™Р’Вµ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В·Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚в„–Р В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’ВµР В  Р РЋРІР‚вЂњР В  Р РЋРІР‚Сћ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’В° Р В Р Р‹Р В Р Р‰Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’В° Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В  Р В РІР‚В Р В  Р РЋРІР‚СћР В  Р РЋРІР‚Сњ
          activeInteraction: {
            playerId: duel.challengerId,
            actingCardId: gs.activeInteraction?.actingCardId, // Р В  Р В Р вЂ№Р В  Р РЋРІР‚СћР В Р Р‹Р Р†Р вЂљР’В¦Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В Р Р‹Р В Р РЏР В  Р вЂ™Р’ВµР В  Р РЋР’В ID Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В
            type: 'duel_betting',
            duelId: duelId,
            targetPlayerId: duel.targetId
          }
        });
      });
    } catch (e) {
      console.error("Р В  Р РЋРІР‚С”Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚В Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В¶Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В:", e);
      notify("Р В  Р РЋРЎСџР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚ВР В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚СћР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚В Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В¶Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В.", 'error');
      logEvent({
        id: `duel_weapon_select_error_${duelId}_${Date.now()}`,
        timestamp: Date.now(), type: 'error',
        message: `Р В  Р РЋРІР‚С”Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚В Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р вЂ™Р’В±Р В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В¶Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В: ${e instanceof Error ? e.message : String(e)}.`,
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

        if (!duel) throw new Error("Р”СѓСЌР»СЊ РЅРµ РЅР°Р№РґРµРЅР°.");
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
        const challengerLogin = getPlayerById(duel.challengerId)?.login || "РРіСЂРѕРє 1";
        const targetLogin = getPlayerById(duel.targetId)?.login || "РРіСЂРѕРє 2";
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
              ? `Р”СѓСЌР»СЊ: РЅРёС‡СЊСЏ (${myRoll} vs ${oppRoll}). РЎС‚Р°РІРєР° РІРѕР·РІСЂР°С‰РµРЅР°.`
              : `Р”СѓСЌР»СЊ: РЅРёС‡СЊСЏ. РЎС‚Р°РІРєР° РІРѕР·РІСЂР°С‰РµРЅР°.`;
          }

          if (duel.weapon === 'dice') {
            return isMeWinner
              ? `РџРѕР±РµРґР°! Р’С‹ РІС‹РёРіСЂР°Р»Рё РґСѓСЌР»СЊ (${myRoll} vs ${oppRoll}) Рё РїРѕР»СѓС‡РёР»Рё ${totalPot} рџ¦–.`
              : `РџРѕСЂР°Р¶РµРЅРёРµ. Р’С‹ РїСЂРѕРёРіСЂР°Р»Рё РґСѓСЌР»СЊ (${myRoll} vs ${oppRoll}) РёРіСЂРѕРєСѓ ${opponentName}.`;
          }

          return isMeWinner
            ? `РџРѕР±РµРґР°! РђРґРјРёРЅ РїСЂРёР·РЅР°Р» РІР°СЃ РїРѕР±РµРґРёС‚РµР»РµРј РєР°СЃС‚РѕРјРЅРѕР№ РґСѓСЌР»Рё. Р’С‹ РїРѕР»СѓС‡РёР»Рё ${totalPot} рџ¦–.`
            : `РџРѕСЂР°Р¶РµРЅРёРµ. РђРґРјРёРЅ РїСЂРёР·РЅР°Р» РїРѕР±РµРґРёС‚РµР»РµРј РёРіСЂРѕРєР° ${opponentName}.`;
        };

        const resultMessage = winnerId === 'draw'
          ? `Р”СѓСЌР»СЊ РјРµР¶РґСѓ ${challengerLogin} Рё ${targetLogin} Р·Р°РІРµСЂС€РёР»Р°СЃСЊ РЅРёС‡СЊРµР№.`
          : `${getPlayerById(winnerId)?.login || 'РРіСЂРѕРє'} РІС‹РёРіСЂР°Р» РґСѓСЌР»СЊ Сѓ ${winnerId === duel.challengerId ? targetLogin : challengerLogin}.`;

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
    } catch (e) {
      console.error("РћС€РёР±РєР° РїСЂРё Р·Р°РІРµСЂС€РµРЅРёРё РґСѓСЌР»Рё:", e);
      notify("РџСЂРѕРёР·РѕС€Р»Р° РѕС€РёР±РєР° РїСЂРё Р·Р°РІРµСЂС€РµРЅРёРё РґСѓСЌР»Рё.", 'error');
      logEvent({
        id: `duel_finish_error_${duelId}_${Date.now()}`,
        timestamp: Date.now(),
        type: 'error',
        message: `РћС€РёР±РєР° РїСЂРё Р·Р°РІРµСЂС€РµРЅРёРё РґСѓСЌР»Рё: ${e instanceof Error ? e.message : String(e)}.`,
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
            message: `${getPlayerById(targetPlayerId)?.login} Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В РЎвЂњР В Р Р‹Р В Р РЏ Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚Сљ ${position}.`,
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
          notify(`${getPlayerById(targetPlayerId)?.login} Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂќР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚Сљ "${cellType === 'bshop' ? 'B-Shop' : 'Gambling'}".`, 'info');
          logEvent({
            id: `landed_on_special_cell_${targetPlayerId}_${Date.now()}`,
            timestamp: Date.now(), type: 'movement',
            message: `${getPlayerById(targetPlayerId)?.login} Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂќР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚Сљ "${cellType === 'bshop' ? 'B-Shop' : 'Gambling'}".`,
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
            message: `${getPlayerById(targetPlayerId)?.login} Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В» Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљР’В°Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚Сћ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’Вµ.`,
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
        const player = pSnap.data() as Player;

        if (skipWithCardId) {
          transaction.update(playerRef, { inventory: arrayRemove(skipWithCardId) });
          transaction.update(gameStateRef, { revealedCards: arrayUnion(skipWithCardId) });
          notify(`Р В  Р Р†Р вЂљРІвЂћСћР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ "${allCards[skipWithCardId]?.name}" Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂќР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р В РІР‚В Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚ВР В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р Р†РІР‚С›РІР‚вЂњР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ.`, 'info', skipWithCardId);
          logEvent({
            id: `interaction_skipped_${skipWithCardId}_${Date.now()}`,
            timestamp: Date.now(), type: 'info',
            message: `${playerData.login} Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ "${allCards[skipWithCardId]?.name}" Р В  Р СћРІР‚ВР В  Р вЂ™Р’В»Р В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚вЂќР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р В РІР‚В Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚ВР В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р Р†РІР‚С›РІР‚вЂњР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ.`,
            playerId: user.uid, cardId: skipWithCardId
          });
        } else if (cardId) {
          const card = allCards[cardId];
          if (card.deck === "inventory") {
            if (cost > 0) {
              transaction.update(playerRef, { tiltCoins: increment(-cost) });
            }

            notify(`Р В  Р Р†Р вЂљРІвЂћСћР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ ${cost > 0 ? 'Р В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚СљР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚ВР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В' : 'Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В'} Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ "${card.name}".`, 'success', card.id);
            logEvent({
              id: `card_acquired_${card.id}_${Date.now()}`,
              timestamp: Date.now(), type: 'card_play',
              message: `${playerData.login} ${cost > 0 ? `Р В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚СљР В  Р РЋРІР‚вЂќР В  Р РЋРІР‚ВР В  Р вЂ™Р’В» Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ "${card.name}" Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В° ${cost} Р В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р Р†Р вЂљРЎв„ў.` : `Р В  Р РЋРІР‚вЂќР В  Р РЋРІР‚СћР В  Р вЂ™Р’В»Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р Р†Р вЂљР Р‹Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В» Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ "${card.name}".`}`,
              playerId: user.uid, cardId: card.id,
              details: { cost: cost, reason: cost > 0 ? 'buy_card' : 'interaction_reward' }
            });

            await handleDrawnCardDistribution(player, card, transaction);
          } else {
            await applyMomentalCardEffect(player, card, transaction); // Р В  Р вЂ™Р’В¦Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В  Р В РІР‚В¦Р В  Р РЋРІР‚СћР В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚ВР В  Р РЋР’ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р вЂ™Р’Вµ Р В Р Р‹Р В Р Р‰Р В Р Р‹Р Р†Р вЂљРЎвЂєР В Р Р‹Р Р†Р вЂљРЎвЂєР В  Р вЂ™Р’ВµР В  Р РЋРІР‚СњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°
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
      notify("Р В  Р РЋРЎСџР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚ВР В  Р вЂ™Р’В·Р В  Р РЋРІР‚СћР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚СћР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚В Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р РЋРІР‚В Р В  Р В РІР‚В Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚ВР В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р Р†РІР‚С›РІР‚вЂњР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ.", 'error');
      logEvent({
        id: `finish_interaction_error_${Date.now()}`,
        timestamp: Date.now(), type: 'error',
        message: `Р В  Р РЋРІР‚С”Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚В Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р В РІР‚В Р В  Р вЂ™Р’ВµР В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р РЋРІР‚В Р В  Р В РІР‚В Р В  Р вЂ™Р’В·Р В  Р вЂ™Р’В°Р В  Р РЋРІР‚ВР В  Р РЋР’ВР В  Р РЋРІР‚СћР В  Р СћРІР‚ВР В  Р вЂ™Р’ВµР В  Р Р†РІР‚С›РІР‚вЂњР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р В РІР‚В Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ: ${e instanceof Error ? e.message : String(e)}.`,
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
      message: `${playerData.login} Р В  Р вЂ™Р’В±Р В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚ВР В  Р вЂ™Р’В» Р В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В±Р В  Р РЋРІР‚ВР В  Р РЋРІР‚Сњ: ${baseRoll + bonus}.`,
      playerId: user.uid,
      details: { baseRoll: baseRoll, bonus: bonus, totalRoll: baseRoll + bonus }
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
    const hasUnresolvedCustomDuel = Object.values(gameState.activeDuels || {}).some(
      (duel) => duel.status === 'admin_wait'
    );

    if (hasUnresolvedCustomDuel) {
      notify("Р В  Р В Р вЂ№Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’В° Р В  Р В РІР‚В Р В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’Вµ Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В·Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р В РІР‚В¦Р В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р В РІР‚В  Р В  Р вЂ™Р’В°Р В  Р СћРІР‚ВР В  Р РЋР’ВР В  Р РЋРІР‚ВР В  Р В РІР‚В¦-Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В.", 'warning');
      return;
    }

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

  const handleAdminUpdateCoins = async (targetId: string, amount: number) => {
    if (!isAdmin) return;
    try {
      await updateDoc(doc(db, "players", targetId), { tiltCoins: amount });
      notify(`Р В  Р Р†Р вЂљР’ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В Р Р‹Р В РЎвЂњ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚вЂќР В  Р вЂ™Р’ВµР В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р В РІР‚В¦Р В  Р РЋРІР‚Сћ Р В  Р РЋРІР‚СћР В  Р вЂ™Р’В±Р В  Р В РІР‚В¦Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦ Р В  Р СћРІР‚ВР В  Р РЋРІР‚Сћ ${amount} Р РЋР вЂљР РЋРЎСџР вЂ™Р’В¦Р Р†Р вЂљРІР‚Сљ`, 'success');
      logEvent({
        id: `admin_coin_update_${targetId}_${Date.now()}`,
        timestamp: Date.now(),
        type: 'coin_change',
        message: `Р В  Р РЋРІР‚в„ўР В  Р СћРІР‚ВР В  Р РЋР’ВР В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™ Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В·Р В  Р РЋР’ВР В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В» Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В Р Р‹Р В РЎвЂњ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р вЂ™Р’В° ${getPlayerById(targetId)?.login} Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° ${amount}.`,
        playerId: user?.uid || 'admin',
        targetPlayerId: targetId,
        details: { amount, action: 'admin_override' }
      });
    } catch (e) {
      console.error("Р В  Р РЋРІР‚С”Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚В Р В  Р РЋРІР‚СћР В  Р вЂ™Р’В±Р В  Р В РІР‚В¦Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р РЋРІР‚В Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В° Р В  Р вЂ™Р’В°Р В  Р СћРІР‚ВР В  Р РЋР’ВР В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В  Р РЋРІР‚СћР В  Р РЋР’В:", e);
      notify("Р В  Р РЋРІР‚С”Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚В Р В  Р РЋРІР‚СћР В  Р вЂ™Р’В±Р В  Р В РІР‚В¦Р В  Р РЋРІР‚СћР В  Р В РІР‚В Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р РЋРІР‚В Р В  Р вЂ™Р’В±Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В Р Р‹Р В РЎвЂњР В  Р вЂ™Р’В°.", 'error');
    }
  };

  const handleAdminAddCard = async (targetId: string, cardId: string) => {
    if (!isAdmin) return;
    try {
      await updateDoc(doc(db, "players", targetId), {
        inventory: arrayUnion(cardId),
      });
      notify(`Р В  Р РЋРІвЂћСћР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В° Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚Сљ`, 'success', cardId);
      logEvent({
        id: `admin_add_card_${Date.now()}`,
        timestamp: Date.now(),
        type: 'card_play',
        message: `Р В  Р РЋРІР‚в„ўР В  Р СћРІР‚ВР В  Р РЋР’ВР В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™ Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В» Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ "${allCards[cardId]?.name || cardId}" Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В Р Р‹Р РЋРІР‚Сљ ${getPlayerById(targetId)?.login}.`,
        playerId: user?.uid || 'admin',
        targetPlayerId: targetId,
        cardId: cardId
      });
    } catch (e) {
      console.error("Р В  Р РЋРІР‚С”Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚В Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’Вµ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р вЂ™Р’В°Р В  Р СћРІР‚ВР В  Р РЋР’ВР В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В  Р РЋРІР‚СћР В  Р РЋР’В:", e);
      notify("Р В  Р РЋРІР‚С”Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р В РІР‚В Р В Р Р‹Р Р†Р вЂљРІвЂћвЂ“Р В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В  Р РЋРІР‚В Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“", 'error');
    }
  };

  const handleAdminRemoveCard = async (targetId: string, cardId: string) => {
    if (!isAdmin) return;
    try {
      await updateDoc(doc(db, "players", targetId), {
        inventory: arrayRemove(cardId),
      });
      notify(`Р В  Р РЋРІвЂћСћР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В° Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р вЂ™Р’В°`, 'info', cardId);
      logEvent({
        id: `admin_rem_card_${Date.now()}`,
        timestamp: Date.now(),
        type: 'info',
        message: `Р В  Р РЋРІР‚в„ўР В  Р СћРІР‚ВР В  Р РЋР’ВР В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В Р Р‹Р В РІР‚С™ Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В» Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р РЋРІР‚Сљ "${allCards[cardId]?.name || cardId}" Р В Р Р‹Р РЋРІР‚Сљ Р В  Р РЋРІР‚ВР В  Р РЋРІР‚вЂњР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚СћР В  Р РЋРІР‚СњР В  Р вЂ™Р’В° ${getPlayerById(targetId)?.login}.`,
        playerId: user?.uid || 'admin',
        targetPlayerId: targetId,
        cardId: cardId
      });
    } catch (e) {
      console.error("Р В  Р РЋРІР‚С”Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В  Р РЋРІР‚вЂќР В Р Р‹Р В РІР‚С™Р В  Р РЋРІР‚В Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В  Р РЋРІР‚В Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“ Р В  Р вЂ™Р’В°Р В  Р СћРІР‚ВР В  Р РЋР’ВР В  Р РЋРІР‚ВР В  Р В РІР‚В¦Р В  Р РЋРІР‚СћР В  Р РЋР’В:", e);
      notify("Р В  Р РЋРІР‚С”Р В Р Р‹Р Р†РІР‚С™Р’В¬Р В  Р РЋРІР‚ВР В  Р вЂ™Р’В±Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В° Р В Р Р‹Р РЋРІР‚СљР В  Р СћРІР‚ВР В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’ВµР В  Р В РІР‚В¦Р В  Р РЋРІР‚ВР В Р Р‹Р В Р РЏ Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РІР‚С™Р В Р Р‹Р Р†Р вЂљРЎв„ўР В Р Р‹Р Р†Р вЂљРІвЂћвЂ“", 'error');
    }
  };

  const handlePrepareTurn = async () => {
    if (!isAdmin) return;
    const hasUnresolvedCustomDuel = Object.values(gameState.activeDuels || {}).some(
      (duel) => duel.status === 'admin_wait'
    );

    if (hasUnresolvedCustomDuel) {
      notify("Р В  Р В Р вЂ№Р В  Р В РІР‚В¦Р В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљР Р‹Р В  Р вЂ™Р’В°Р В  Р вЂ™Р’В»Р В  Р вЂ™Р’В° Р В  Р В РІР‚В Р В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В Р Р‹Р В РЎвЂњР В  Р РЋРІР‚ВР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’Вµ Р В Р Р‹Р В РІР‚С™Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В·Р В Р Р‹Р РЋРІР‚СљР В  Р вЂ™Р’В»Р В Р Р‹Р В Р вЂ°Р В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р вЂ™Р’В°Р В Р Р‹Р Р†Р вЂљРЎв„ў Р В  Р РЋРІР‚СњР В  Р вЂ™Р’В°Р В Р Р‹Р В РЎвЂњР В Р Р‹Р Р†Р вЂљРЎв„ўР В  Р РЋРІР‚СћР В  Р РЋР’ВР В  Р В РІР‚В¦Р В  Р РЋРІР‚СћР В  Р Р†РІР‚С›РІР‚вЂњ Р В  Р СћРІР‚ВР В Р Р‹Р РЋРІР‚СљР В Р Р‹Р В Р Р‰Р В  Р вЂ™Р’В»Р В  Р РЋРІР‚В Р В  Р В РІР‚В  Р В  Р вЂ™Р’В°Р В  Р СћРІР‚ВР В  Р РЋР’ВР В  Р РЋРІР‚ВР В  Р В РІР‚В¦-Р В  Р РЋРІР‚вЂќР В  Р вЂ™Р’В°Р В  Р В РІР‚В¦Р В  Р вЂ™Р’ВµР В  Р вЂ™Р’В»Р В  Р РЋРІР‚В.", 'warning');
      return;
    }

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
