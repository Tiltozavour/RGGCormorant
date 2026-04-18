import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import type { User } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  updateDoc,
} from "firebase/firestore";
import Auth from "./components/Auth";
import { syncWheelResult, syncWheelVisibility } from "./components/gameStateService";
import BottomPanel from "./components/BottomPanelPhase";
import GameBoard from "./components/GameBoard";
import PlayersSidebar from "./components/PlayersSidebar";
import ScoresDetailsPage from "./components/ScoresDetailsPage";
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
  const [phaseNotification, setPhaseNotification] = useState<string | null>(null);
  const [isPlayersSidebarOpen, setIsPlayersSidebarOpen] = useState(false);
  const [isScoresDetailsOpen, setIsScoresDetailsOpen] = useState(false);

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
    let notificationTimer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = onSnapshot(gameStateRef, (snap) => {
      if (!snap.exists()) {
        setGameState(defaultGameState);
        return;
      }

      const nextGameState: GameState = {
        ...defaultGameState,
        ...(snap.data() as Partial<GameState>),
      };

      setGameState((prevGameState) => {
        if (prevGameState.phase !== nextGameState.phase) {
          setPhaseNotification(PHASE_LABELS[nextGameState.phase]);
          if (notificationTimer) {
            clearTimeout(notificationTimer);
          }
          notificationTimer = setTimeout(() => setPhaseNotification(null), 3000);
        }

        return nextGameState;
      });
    });

    return () => {
      unsubscribe();
      if (notificationTimer) {
        clearTimeout(notificationTimer);
      }
    };
  }, []);

  const chooseStart = async (cellId: number) => {
    if (!user) return;

    await updateDoc(doc(db, "players", user.uid), {
      position: cellId,
      prevCell: null,
      inGame: true,
    });

    setPlayerData((prev) =>
      prev
        ? {
            ...prev,
            position: cellId,
            prevCell: null,
            inGame: true,
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
    const activePlayers = players
      .filter((player) => player.inGame && player.role !== "admin")
      .map((player) => player.id);

    return {
      turnOrder: activePlayers,
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
        <h2 className="font-title text-2xl text-yellow-400 tracking-widest">
          Cormorant Society
                <span className="text-xl font-bold text-purple/90 "> | Этап {gameState.round}</span>
        </h2>

        <div className="flex items-center gap-3">
          <img
            src={playerData.avatar || FALLBACK_AVATAR}
            className="w-8 h-8 rounded-full border border-yellow-500/30 object-cover"
          />
          <span>{playerData.login}</span>
        </div>

        <div className="flex items-center gap-5">
          <button
            onClick={() => setIsPlayersSidebarOpen(true)}
            className="text-sm text-yellow-300 underline underline-offset-4 hover:text-yellow-200 transition"
          >
            Игроки и очки
          </button>

          <div
            className="text-green-400 cursor-pointer"
            onClick={() => setIsSidebarOpen(true)}
          >
            Coins: {playerData.tiltCoins ?? 0}
          </div>
        </div>
      </div>

      <div className="flex flex-col flex-1">
        {phaseNotification && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-yellow-900/80 border border-yellow-500/40 px-8 py-3 rounded-xl backdrop-blur-xl animate-pulse">
            <span className="text-yellow-200 text-lg font-semibold">
              {phaseNotification}
            </span>
          </div>
        )}

        <div className="flex-1 p-6">
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

        <BottomPanel
          currentUser={user}
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
        />
      </div>

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

      <div
        className={`fixed top-0 right-0 h-full w-80 backdrop-blur-xl border-l border-yellow-500/20 p-4 flex flex-col gap-4 z-50 transform transition-transform duration-300 ${
          isSidebarOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <button onClick={() => setIsSidebarOpen(false)}>Close</button>

        <div className="flex flex-col items-center gap-3">
          <img
            src={playerData.avatar || FALLBACK_AVATAR}
            onClick={() => setIsAvatarModalOpen(true)}
            className="w-24 h-24 rounded-full cursor-pointer"
          />
          <h2>{playerData.login}</h2>
        </div>

        <div>
          <h2>Balance</h2>
          <p>Coins: {playerData.tiltCoins ?? 0}</p>
        </div>

        <div className="border-t border-yellow-500/20 pt-4 mt-auto">
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 bg-red-900/40 border border-red-500/30 text-red-300 rounded-lg hover:bg-red-900/60 transition"
          >
            Выйти
          </button>
        </div>
      </div>

      {isAvatarModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-zinc-900 p-6 rounded-xl w-80 flex flex-col gap-4">
            <h2>Изменить аватар</h2>

            <input
              value={newAvatarUrl}
              onChange={(e) => setNewAvatarUrl(e.target.value)}
              className="p-2 bg-black border"
            />

            <div className="flex gap-2">
              <button onClick={updateAvatar}>Сохранить</button>
              <button onClick={() => setIsAvatarModalOpen(false)}>
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
