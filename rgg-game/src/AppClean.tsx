import { useCallback, useEffect, useState } from "react";
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
import Auth from "./components/Auth";
import { syncWheelResult, syncWheelVisibility } from "./components/gameStateService";
import BottomPanel from "./components/BottomPanelPhase";
import GameBoard from "./components/GameBoard";
import PlayersSidebar from "./components/PlayersSidebar";
import ScoresDetailsPage from "./components/ScoresDetailsPage";
import type { GameCard } from "./types/card";
import { auth, db } from "./firebase";
import { defaultGameState } from "./types/game";
import type { GamePhase, GameState, Player } from "./types/game";

const FALLBACK_AVATAR =
  "https://i.pinimg.com/736x/6f/8d/ce/6f8dcedfc7102d5e88e0af7b88634fc2.jpg";

const PHASE_ORDER: GamePhase[] = [
  "waiting_game",
  "playing",
  "results",
  "voting",
  "turn",
  "next_game",
];

const PHASE_LABELS: Record<GamePhase, string> = {
  waiting_game: "Ожидание начала игры",
  playing: "Игра началась",
  results: "Результаты раунда",
  voting: "Голосование",
  turn: "Ход",
  next_game: "Раунд завершен",
};

function AppClean() {
  const [user, setUser] = useState<User | null>(null);
  const [playerData, setPlayerData] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState>(defaultGameState);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [newAvatarUrl, setNewAvatarUrl] = useState("");
  const [isPlayersSidebarOpen, setIsPlayersSidebarOpen] = useState(false);
  const [isScoresDetailsOpen, setIsScoresDetailsOpen] = useState(false);
  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(false);
  const [allCards, setAllCards] = useState<Record<string, GameCard>>({});
  const [selectedCard, setSelectedCard] = useState<GameCard | null>(null);

  // Логика использования карты (вынесена на уровень App для корректного перекрытия UI)
  const handleUseCard = async (card: GameCard) => {
    if (!user || !playerData) return;

    try {
      const playerRef = doc(db, "players", user.uid);
      
      // 1. Удаляем карту из инвентаря в БД
      await updateDoc(playerRef, {
        inventory: arrayRemove(card.id)
      });

      // 2. Обработка эффектов
      if (card.action === 'add_coins') {
        await updateDoc(playerRef, {
          tiltCoins: increment(card.value)
        });
      } 
      else if (card.action === 'move_steps') {
        alert(`Использована карта: ${card.name}. Эффект: перемещение на ${card.value}`);
      }
      else if (card.action === 'protection') {
        alert("Защита активирована!");
      }

      setSelectedCard(null);
      console.log(`🚀 Карта ${card.name} успешно использована`);
    } catch (e) {
      console.error("Ошибка при использовании карты:", e);
    }
  };

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "cards"), (snap) => {
      const cardMap: Record<string, GameCard> = {};
      snap.docs.forEach((doc) => {
        cardMap[doc.id] = { id: doc.id, ...doc.data() } as GameCard;
      });
      setAllCards(cardMap);
    });
    return () => unsubscribe();
  }, []);

  const handleUpdateLogin = async (val: string) => {
    if (!user || !playerData || val === playerData.login || val.trim().length < 3) return;
    await updateDoc(doc(db, "players", user.uid), { login: val.trim() });
  };

  const handleUpdateBorderColor = async (color: string) => {
    if (!user) return;
    await updateDoc(doc(db, "players", user.uid), { borderColor: color });
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch {
      // ignore auth cleanup errors
    }
  };

  const isAdmin = playerData?.role === "admin";
  const currentTurnPlayerId =
    gameState.turnOrder[gameState.currentTurnIndex] ?? null;
  const hasTurnOrder = gameState.turnOrder.length > 0;
  const isTurnPhase = gameState.phase === "turn";
  const isCurrentPlayersTurn = !hasTurnOrder || currentTurnPlayerId === user?.uid;
  const canRoll =
    !isAdmin &&
    Boolean(playerData?.inGame) &&
    isTurnPhase &&
    isCurrentPlayersTurn &&
    gameState.currentRoll === null;
  const canConfirmRoll =
    !isAdmin &&
    Boolean(playerData?.inGame) &&
    isCurrentPlayersTurn &&
    gameState.currentRoll !== null &&
    !gameState.rollConfirmed;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const playerRef = doc(db, "players", user.uid);
    const unsubscribe = onSnapshot(playerRef, (snap) => {
      if (!snap.exists()) {
        setPlayerData(null);
        return;
      }

      setPlayerData({
        id: snap.id,
        ...(snap.data() as Omit<Player, "id">),
      });
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "players"), (snap) => {
      setPlayers(
        snap.docs.map((playerDoc) => ({
          id: playerDoc.id,
          ...(playerDoc.data() as Omit<Player, "id">),
        }))
      );
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const gameStateRef = doc(db, "gameState", "current");

    const unsubscribe = onSnapshot(gameStateRef, (snap) => {
      if (!snap.exists()) {
        setGameState(defaultGameState);
        return;
      }

      const nextGameState: GameState = {
        ...defaultGameState,
        ...(snap.data() as Partial<GameState>),
      };
      setGameState(nextGameState);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const chooseStart = async (cellId: number) => {
    if (!user) return;

    await updateDoc(doc(db, "players", user.uid), {
      position: cellId,
      prevCell: null,
      inGame: true,
      inventory: ["inv_start_move", "inv_start_protect"]
    });

    setPlayerData((prev) =>
      prev
        ? {
            ...prev,
            position: cellId,
            prevCell: null,
            inGame: true,
            inventory: ["inv_start_move", "inv_start_protect"]
          }
        : prev
    );
  };

  const updateAvatar = async () => {
    if (!user) return;

    await updateDoc(doc(db, "players", user.uid), {
      avatar: newAvatarUrl,
    });

    setPlayerData((prev) =>
      prev
        ? {
            ...prev,
            avatar: newAvatarUrl,
          }
        : prev
    );

    setIsAvatarModalOpen(false);
    setNewAvatarUrl("");
  };

  const handleMoveComplete = useCallback(
    async (position: number, prevCell: number | null) => {
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

        const isLastPlayer =
          turnOrder.length > 0 && currentTurnIndex === turnOrder.length - 1;

        if (isLastPlayer) {
          transaction.update(gameStateRef, {
            phase: "next_game",
            currentRoll: null,
            currentRollPlayerId: null,
            currentTurnIndex: 0,
            rollConfirmed: false,
          });
          return;
        }

        const nextTurnIndex =
          turnOrder.length > 0
            ? (currentTurnIndex + 1) % turnOrder.length
            : currentTurnIndex;

        transaction.update(gameStateRef, {
          currentRoll: null,
          currentRollPlayerId: null,
          currentTurnIndex: nextTurnIndex,
          rollConfirmed: false,
        });
      });
    },
    [user]
  );

  const handleRoll = async () => {
    if (!user || !canRoll) return;

    const roll = Math.floor(Math.random() * 6) + 1;

    await updateDoc(doc(db, "gameState", "current"), {
      currentRoll: roll,
      currentRollPlayerId: user.uid,
      rollConfirmed: false,
    });
  };

  const handleConfirmRoll = async () => {
    if (!user || !canConfirmRoll) return;

    await updateDoc(doc(db, "gameState", "current"), {
      rollConfirmed: true,
    });
  };

  const buildTurnState = () => {
    const activePlayers = players.filter((p) => p.inGame && p.role !== "admin");
    const allZero = activePlayers.every((p) => (p.tiltCoins ?? 0) === 0);

    let sortedIds: string[];

    if (allZero) {
      // 1. Если у всех 0 — полный рандом
      sortedIds = activePlayers
        .map((p) => ({ id: p.id, rnd: Math.random() }))
        .sort((a, b) => a.rnd - b.rnd)
        .map((p) => p.id);
    } else {
      // 2. Сортировка по очкам (tiltCoins) DESC
      // При равенстве очков — приоритет тому, кто был раньше в предыдущей turnOrder
      const currentOrder = gameState.turnOrder;

      sortedIds = [...activePlayers]
        .sort((a, b) => {
          const scoreA = a.tiltCoins ?? 0;
          const scoreB = b.tiltCoins ?? 0;

          if (scoreB !== scoreA) return scoreB - scoreA;

          const idxA = currentOrder.indexOf(a.id);
          const idxB = currentOrder.indexOf(b.id);
          // Если оба были в прошлом списке, сохраняем их относительный порядок
          return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
        })
        .map((p) => p.id);
    }

    return {
      turnOrder: sortedIds,
      currentTurnIndex: 0,
      currentRoll: null,
      currentRollPlayerId: null,
      rollConfirmed: false,
    };
  };

  const handleSetPhase = async (phase: GamePhase) => {
    if (!isAdmin) return;

    const payload: Partial<GameState> = { phase };

    if (phase === "turn") {
      Object.assign(payload, buildTurnState());
    } else {
      payload.currentRoll = null;
      payload.currentRollPlayerId = null;
      payload.rollConfirmed = false;
    }

    await updateDoc(doc(db, "gameState", "current"), payload);
  };

  const handleStepPhase = async (direction: -1 | 1) => {
    if (!isAdmin) return;

    const currentIndex = PHASE_ORDER.indexOf(gameState.phase);
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;

    let nextIndex = safeIndex + direction;
    let nextRound = gameState.round;

    if (nextIndex >= PHASE_ORDER.length) {
      nextIndex = 0;
      nextRound += 1;
    } else if (nextIndex < 0) {
      nextIndex = PHASE_ORDER.length - 1;
      if (nextRound > 0) nextRound -= 1;
    }

    const nextPhase = PHASE_ORDER[nextIndex];
    const payload: Partial<GameState> = { 
      phase: nextPhase,
      round: nextRound 
    };

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

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-black text-white">
        Проверка доступа...
      </div>
    );
  }

  if (!user) {
    return <Auth onLogin={setUser} />;
  }

  if (!playerData) {
    return (
      <div className="h-screen flex items-center justify-center bg-black text-white">
        Загрузка профиля...
      </div>
    );
  }

  if (isScoresDetailsOpen) {
    return (
      <ScoresDetailsPage
        players={players}
        totalScores={gameState.scores}
        gameHistory={gameState.gameHistory}
        onBack={() => setIsScoresDetailsOpen(false)}
      />
    );
  }

  return (
    <div className="h-screen bg-transparent text-white flex flex-col">
      <div className="fixed inset-0 bg-gradient-to-b from-black via-transparent to-black opacity-80 -z-10" />

      <video
        autoPlay
        loop
        muted
        className="fixed top-0 left-0 w-full h-full object-cover blur-sm scale-105 -z-20"
      >
        <source src="/video/bg.mp4" type="video/mp4" />
      </video>

      <div className="flex justify-between items-center p-4 backdrop-blur-sm border-b border-yellow-500/20">
        <div className="flex items-center gap-6">
          <h2 
            className="font-title text-2xl text-yellow-400 tracking-widest cursor-pointer hover:opacity-80 transition-all active:scale-95"
            onClick={() => setIsPlayersSidebarOpen(true)}
            title="Открыть рейтинг игроков"
          >
            Cormorant Society
                  <span className="text-xl font-bold text-purple/90 "> | Этап {gameState.round}</span>
          </h2>

          <div 
            className="bg-yellow-900/60 border border-yellow-500/40 px-4 py-1 rounded-lg backdrop-blur-xl animate-pulse flex items-center justify-center"
            style={{ fontFamily: "'Comfortaa', sans-serif" }}
          >
            <span className="text-yellow-200 text-xs font-black uppercase tracking-[0.2em]">
              {PHASE_LABELS[gameState.phase]}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div
            className="flex items-center gap-4 cursor-pointer hover:opacity-80 transition-all active:scale-95 group"
            onClick={() => setIsSidebarOpen(true)}
          >
            <div className="flex flex-col items-end hidden sm:flex">
              <span 
                className="text-sm font-black text-white tracking-tight"
                style={{ fontFamily: "'Comfortaa', sans-serif" }}
              >
                {playerData.login}
              </span>
              {!isAdmin && (
              <span className="text-sm text-green-400 font-black leading-none mt-1"  style={{ fontFamily: "'Comfortaa', sans-serif" }}>{playerData.tiltCoins ?? 0} 🦖</span>
              )}
            </div>
            
            <div 
              className="w-10 h-10 rounded-full p-[2px] shadow-lg transition-transform duration-300 group-hover:rotate-12"
              style={{ background: playerData.borderColor || '#fac319' }}
            >
              <img
                src={playerData.avatar || FALLBACK_AVATAR}
                className="w-full h-full rounded-full object-cover border-2 border-black"
                alt="me"
              />
            </div>

            <div className="text-zinc-500 font-light text-xl ml-1 group-hover:text-yellow-500 transition-colors">
              {isAdmin ? "⚙️" : "☰"}
            </div>
          </div>
        </div>
      </div>

      <div className="relative flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <GameBoard
            playerData={
              isAdmin
                ? ({ id: "__admin__", login: "Admin", inGame: false } as Player)
                : playerData
            }
            players={players}
            currentRoll={gameState.currentRoll}
            currentRollPlayerId={gameState.currentRollPlayerId}
            rollConfirmed={gameState.rollConfirmed}
            currentTurnPlayerId={currentTurnPlayerId}
            chooseStart={chooseStart}
            onMoveComplete={handleMoveComplete}
            showWheel={gameState.showWheel}
            onWheelResult={(res) => void syncWheelResult("current", res)}
            onCloseWheel={() => void syncWheelVisibility("current", false)}
            round={gameState.round}
          />
        </div>

        {/* Кнопка-язычок для вызова панели управления */}
        <button
          onClick={() => setIsBottomPanelOpen(!isBottomPanelOpen)}
          className={`absolute left-1/2 -translate-x-1/2 z-40 bg-purple-600/90 hover:bg-purple-500 text-white px-8 py-2 rounded-t-2xl font-black text-[10px] uppercase tracking-[0.3em] transition-all active:scale-95 shadow-[0_-10px_30px_rgba(0,0,0,0.6)] border-x border-t border-white/20 backdrop-blur-md ${
            isBottomPanelOpen ? "bottom-40" : "bottom-0"
          }`}
          style={{ fontFamily: "'Comfortaa', sans-serif" }}
        >
          {isBottomPanelOpen ? "▼ Скрыть управление" : "▲ Панель управления"}
        </button>

        <div className={`shrink-0 transition-all duration-300 ease-in-out ${isBottomPanelOpen ? "h-40 opacity-100 overflow-visible" : "h-0 opacity-0 pointer-events-none overflow-hidden"}`}>
          <BottomPanel
            currentUser={user}
            players={players}
            isAdmin={isAdmin}
            gameState={gameState}
            onRoll={handleRoll}
            canRoll={canRoll}
            currentTurnPlayerId={currentTurnPlayerId}
            onPrevPhase={() => void handleStepPhase(-1)}
            onNextPhase={() => void handleStepPhase(1)}
            onPrepareTurn={() => void handlePrepareTurn()}
            onConfirmRoll={handleConfirmRoll}
            canConfirmRoll={canConfirmRoll}
            onToggleWheel={() => void syncWheelVisibility("current", !gameState.showWheel)}
            allCards={allCards}
            onCardClick={(card) => setSelectedCard(card)}
          />
        </div>
      </div>

      {/* Модалка предпросмотра карты (теперь перекрывает всё, включая фишки и кнопку управления) */}
      {selectedCard && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-[10002]" onClick={() => setSelectedCard(null)}>
          <div 
            className="bg-zinc-900 border-t-2 border-x-2 rounded-t-[2rem] w-full max-w-md flex flex-col overflow-hidden shadow-[0_-20px_50px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom duration-500" 
            style={{ borderColor: (selectedCard.bgCard || '#fac319') + '50' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="h-48 w-full relative bg-black/40 flex items-center justify-center border-b border-white/5">
              <img src={selectedCard.faceCard} alt={selectedCard.name} className="w-full h-full object-contain p-4" />
              <div className="absolute top-4 right-4 bg-black/60 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-white border border-white/10">
                {selectedCard.rarity}
              </div>
            </div>
            
            <div className="p-6 flex flex-col gap-4 text-center">
              <div>
                <h2 className="text-xl font-black text-white uppercase leading-tight">{selectedCard.name}</h2>
                <p className="text-sm text-zinc-400 mt-2 font-medium leading-relaxed italic">"{selectedCard.description}"</p>
              </div>

              <div className="flex flex-col gap-2 mt-2">
                <button 
                  onClick={() => handleUseCard(selectedCard)}
                  className="bg-purple-600 hover:bg-purple-500 text-white py-4 rounded-2xl font-black uppercase text-sm transition-all active:scale-95 shadow-lg shadow-purple-500/20"
                >
                  Использовать карту
                </button>
                <button 
                  onClick={() => setSelectedCard(null)}
                  className="text-zinc-500 hover:text-zinc-300 py-2 text-xs uppercase font-bold transition-colors"
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <PlayersSidebar
        isOpen={isPlayersSidebarOpen}
        players={players}
        totalScores={gameState.scores}
        gameHistory={gameState.gameHistory}
        currentUserId={user.uid}
        onClose={() => setIsPlayersSidebarOpen(false)}
        onOpenDetails={() => {
          setIsPlayersSidebarOpen(false);
          setIsScoresDetailsOpen(true);
        }}
      />

      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed top-0 right-0 h-full w-80 backdrop-blur-xl border-l border-yellow-500/20 p-6 flex flex-col gap-8 z-50 transform transition-transform duration-500 ease-out ${
          isSidebarOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ fontFamily: "'Comfortaa', sans-serif" }}
      >
        <div className="flex justify-end -mr-2 -mt-2">
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="text-zinc-500 hover:text-white hover:scale-110 active:scale-90 transition-all p-2 text-2xl font-light"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col items-center gap-6">
          <div 
            className="relative p-1 rounded-full transition-all duration-500 shadow-2xl"
            style={{ background: playerData.borderColor || '#fac319' }}
          >
            <img
              src={playerData.avatar || FALLBACK_AVATAR}
              onClick={() => setIsAvatarModalOpen(true)}
              className="w-28 h-28 rounded-full cursor-pointer object-cover border-4 border-black hover:opacity-80 transition-opacity"
              title="Нажмите, чтобы изменить аватар"
            />
          </div>

          <div className="flex flex-col gap-5 w-full">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] uppercase font-black text-zinc-500 tracking-[0.2em] px-1">Ваш позывной</label>
              <input 
                key={playerData.id + playerData.login}
                defaultValue={playerData.login}
                onBlur={(e) => handleUpdateLogin(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className="bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-white font-bold focus:border-yellow-500/50 outline-none transition-all shadow-inner"
              />
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-[10px] uppercase font-black text-zinc-500 tracking-[0.2em] px-1">Цвет ауры</label>
              <div className="flex gap-2.5 flex-wrap px-1">
                {["#fac319", "#a855f7", "#3b82f6", "#ef4444", "#10b981", "#f97316", "#ffffff"].map(color => (
                  <button 
                    key={color}
                    onClick={() => handleUpdateBorderColor(color)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${playerData.borderColor === color ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-50 hover:opacity-100 hover:scale-105'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-yellow-500/20 pt-4 mt-auto">
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 bg-red-900/40 border border-red-500/30 text-red-300 rounded-lg hover:bg-red-900/60 hover:scale-[1.02] active:scale-95 transition-all"
          >
            Выйти
          </button>
        </div>
      </aside>

      {isAvatarModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[10001] p-4">
          <div className="bg-zinc-950 border border-yellow-500/30 p-8 rounded-[2.5rem] w-full max-w-sm flex flex-col gap-6 shadow-2xl animate-in zoom-in duration-300" style={{ fontFamily: "'Comfortaa', sans-serif" }}>
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-black text-yellow-500 uppercase italic tracking-tighter">Сменить аватар</h2>
              <p className="text-xs text-zinc-500">Введите прямую ссылку на изображение</p>
            </div>

            <div className="flex flex-col gap-2">
              <input
                value={newAvatarUrl}
                onChange={(e) => setNewAvatarUrl(e.target.value)}
                placeholder="https://i.pinimg.com/..."
                className="w-full p-4 bg-black/50 border border-white/10 rounded-2xl text-white outline-none focus:border-yellow-500/50 transition-all font-bold placeholder:text-zinc-700"
              />
            </div>

            <div className="flex gap-3">
              <button 
                onClick={updateAvatar}
                className="flex-1 bg-yellow-500 text-black py-4 rounded-2xl font-black uppercase text-sm hover:bg-white transition-all active:scale-95 shadow-[0_5px_0_#a16207] active:shadow-none active:translate-y-1"
              >
                Принять
              </button>
              <button 
                onClick={() => setIsAvatarModalOpen(false)}
                className="flex-1 bg-zinc-800 text-zinc-400 py-4 rounded-2xl font-bold uppercase text-sm hover:text-white transition-all"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AppClean;
