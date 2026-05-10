import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import type { GameCard } from "../types/card";
import { defaultGameState } from "../types/game";
import type { GameState, Player } from "../types/game";
import type { GameEvent, ToastNotification } from "./useModalStates";

export function useFirestoreSubscriptions(
  notify: (message: string, type?: ToastNotification["type"], cardId?: string) => void,
) {
  void notify;
  const [user, setUser] = useState<User | null>(null);
  const [playerData, setPlayerData] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState>(defaultGameState);
  const [allCards, setAllCards] = useState<Record<string, GameCard>>({});
  const [gameEvents, setGameEvents] = useState<GameEvent[]>([]);
  const lastAppliedCardMoveRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setPlayerData(null);

      if (u) {
        setLoading(true);
        return;
      }

      setLoading(false);
      setPlayers([]);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, "players", user.uid),
      (snap) => {
        if (snap.exists()) {
          setPlayerData({ id: snap.id, ...(snap.data() as Omit<Player, "id">) });
          setLoading(false);
          return;
        }

        setPlayerData(null);
        setLoading(false);
        notify("Профиль игрока не найден. Возможно, он был удален из Firestore. Войдите или зарегистрируйтесь заново.", "error");
        void signOut(auth).catch((error) => {
          console.error("Failed to sign out after missing player profile:", error);
        });
      },
      (error) => {
        console.error("Failed to subscribe to player profile:", error);
        setPlayerData(null);
        setLoading(false);
        notify("Не удалось загрузить профиль игрока. Проверьте Firestore rules и подключение.", "error");
      },
    );
  }, [notify, user]);

  useEffect(() => {
    if (!user) return;
    const eventsQuery = query(collection(db, "gameEvents"), orderBy("timestamp", "desc"), limit(100));
    return onSnapshot(eventsQuery, (snap) => {
      setGameEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as GameEvent)));
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

  return {
    user,
    playerData,
    loading,
    players,
    gameState,
    allCards,
    gameEvents,
  };
}
