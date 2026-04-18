export { default } from "./AppClean";
/*
import Auth from "./components/Auth";
import GameBoard from "./components/GameBoard";
import {
  doc,
  getDocs,
  onSnapshot,
  updateDoc,
  collection,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";
import BottomPanel from "./components/BottomPanelTurn";
import { defaultGameState } from "./types/game";
import type { GameState, Player } from "./types/game";


function App() {
  const [user, setUser] = useState<any>(null);
  const [playerData, setPlayerData] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState>(defaultGameState);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [newAvatarUrl, setNewAvatarUrl] = useState("");
  const isAdmin = playerData?.role === "admin";
  const currentTurnPlayerId =
    gameState.turnOrder[gameState.currentTurnIndex] ?? null;
  const hasTurnOrder = gameState.turnOrder.length > 0;
  const isCurrentPlayersTurn =
    !hasTurnOrder || currentTurnPlayerId === user?.uid;
  const canRoll =
    !isAdmin &&
    Boolean(playerData?.inGame) &&
    isCurrentPlayersTurn &&
    gameState.currentRoll === null;

  // 🔐 СЛУШАЕМ АВТОРИЗАЦИЮ (ВАЖНО: В САМОМ ВЕРХУ)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // 🔄 Загружаем игрока
  useEffect(() => {
    if (!user) {
      setPlayerData(null);
      return;
    }

    const ref = doc(db, "players", user.uid);
    const unsubscribe = onSnapshot(ref, (snap) => {
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
    const loadPlayers = async () => {
      const snap = await getDocs(collection(db, "players"));

      const list: any[] = [];
      snap.forEach((doc) =>
        list.push({
          id: doc.id,
          ...doc.data(),
        })
      );

      setPlayers(list);
    };

    loadPlayers();
  }, [playerData]); // обновляем после изменения себя

  // 🚀 выбор стартовой позиции
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "players"), (snap) => {
      const list: Player[] = snap.docs.map((playerDoc) => ({
        id: playerDoc.id,
        ...(playerDoc.data() as Omit<Player, "id">),
      }));

      setPlayers(list);
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

      setGameState({
        ...defaultGameState,
        ...(snap.data() as Partial<GameState>),
      });
    });

    return () => unsubscribe();
  }, []);

  const chooseStart = async (cellId: number) => {
    if (!user) return;

    const ref = doc(db, "players", user.uid);

    await updateDoc(ref, {
      position: cellId,
      prevCell: null,
      inGame: true,
    });

    setPlayerData((prev: any) => ({
      ...prev,
      position: cellId,
      prevCell: null,
      inGame: true,
    }));
  };


  // ⏳ Глобальная загрузка
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-black text-white">
        Проверка доступа...
      </div>
    );
  }

  // 🔐 НЕ ЗАЛОГИНЕН
  if (!user) {
    return <Auth onLogin={setUser} />;
  }

  // ⏳ Ждём данные игрока
  if (!playerData) {
    return (
      <div className="h-screen flex items-center justify-center bg-black text-white">
        Загрузка профиля...
      </div>
    );
  }

  // 🖼️ Обновление аватарки
  const updateAvatar = async () => {
    if (!user) return;

    const ref = doc(db, "players", user.uid);

    await updateDoc(ref, {
      avatar: newAvatarUrl,
    });

    setPlayerData((prev: any) => ({
      ...prev,
      avatar: newAvatarUrl,
    }));

    setIsAvatarModalOpen(false);
    setNewAvatarUrl("");
  };

  const handleMoveComplete = async (
    position: number,
    prevCell: number | null
  ) => {
    if (!user) return;

    await updateDoc(doc(db, "players", user.uid), {
      position,
      prevCell,
    });

    const nextTurnIndex =
      hasTurnOrder && gameState.turnOrder.length > 0
        ? (gameState.currentTurnIndex + 1) % gameState.turnOrder.length
        : gameState.currentTurnIndex;

    await updateDoc(doc(db, "gameState", "current"), {
      currentRoll: null,
      currentRollPlayerId: null,
      currentTurnIndex: nextTurnIndex,
    });
  };

  const handleRoll = async () => {
    if (!user || !canRoll) return;

    const roll = Math.floor(Math.random() * 6) + 1;

    await updateDoc(doc(db, "gameState", "current"), {
      currentRoll: roll,
      currentRollPlayerId: user.uid,
    });
  };

  return (
    <div className="h-screen bg-transparent text-white flex flex-col">

      // ГРАДИЕНТ
      <div className="fixed inset-0 bg-gradient-to-b from-black via-transparent to-black opacity-80 -z-10"></div>

      // ВИДЕО
      <video
        autoPlay
        loop
        muted
        className="fixed top-0 left-0 w-full h-full object-cover blur-sm scale-105 -z-20"
      >
        <source src="/video/bg.mp4" type="video/mp4" />
      </video>

      // TOP BAR
      <div className="flex justify-between items-center p-4 backdrop-blur-sm border-b border-yellow-500/20">

        <h2 className="font-title text-2xl text-yellow-400 tracking-widest">
          Cormorant Society
        </h2>

        <div className="flex items-center gap-3">
          <img
            src={playerData.avatar || "https://i.pinimg.com/736x/6f/8d/ce/6f8dcedfc7102d5e88e0af7b88634fc2.jpg"}
            className="w-8 h-8 rounded-full border border-yellow-500/30 object-cover"
          />
          <span>{playerData.login}</span>
        </div>

        <div
          className="text-green-400 cursor-pointer"
          onClick={() => setIsSidebarOpen(true)}
        >
          🦖 {playerData.tiltCoins}
        </div>
      </div>

      // КОНТЕНТ

        <div className="flex flex-col flex-1">

  <div className="flex-1 p-6">
    <GameBoard
      playerData={playerData}
      currentRoll={gameState.currentRoll}
      currentRollPlayerId={gameState.currentRollPlayerId}
      chooseStart={chooseStart}
      onMoveComplete={handleMoveComplete}
    />
  </div>

  <BottomPanel
    players={players}
    currentUser={user}
    isAdmin={isAdmin}
    gameState={gameState}
    onRoll={handleRoll}
    canRoll={canRoll}
    currentTurnPlayerId={currentTurnPlayerId}
  />

</div>

        // Overlay
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        // Sidebar
        <div
          className={`fixed top-0 right-0 h-full w-80 backdrop-blur-xl border-l border-yellow-500/20 p-4 flex flex-col gap-4 z-50 transform transition-transform duration-300 ${
            isSidebarOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >

          <button onClick={() => setIsSidebarOpen(false)}>✕</button>

          <div className="flex flex-col items-center gap-3">
            <img
              src={playerData.avatar || "https://i.pinimg.com/736x/6f/8d/ce/6f8dcedfc7102d5e88e0af7b88634fc2.jpg"}
              onClick={() => setIsAvatarModalOpen(true)}
              className="w-24 h-24 rounded-full cursor-pointer"
            />
            <h2>{playerData.login}</h2>
          </div>

          <div>
            <h2>Баланс</h2>
            <p>🦖 {playerData.tiltCoins}</p>
          </div>

        </div>

        // МОДАЛКА
        {isAvatarModalOpen && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">

            <div className="bg-zinc-900 p-6 rounded-xl w-80 flex flex-col gap-4">

              <h2>Изменить аватар?</h2>

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

export default App;
*/
