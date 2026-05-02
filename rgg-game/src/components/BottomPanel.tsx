import React, { useState } from "react";
import type { GameCard } from "../types/card";
import type { GameState, Player } from "../types/game";
import type { User } from "firebase/auth";
import { doc, updateDoc, increment } from "firebase/firestore";
import { db } from "../firebase";
import { uploadStarterCards } from "../types/cardService";
import { PHASE_LABELS } from "./gameConstants";

interface BottomPanelProps {
  currentUser: User | null;
  players: Player[];
  isAdmin: boolean;
  gameState: GameState;
  onRoll: () => void;
  canRoll: boolean;
  currentTurnPlayerId: string | null;
  onPrevPhase: () => void;
  onNextPhase: () => void;
  onPrepareTurn: () => void;
  onResetGame?: () => void | Promise<void>;
  onConfirmRoll: () => void;
  canConfirmRoll: boolean;
  onToggleWheel?: () => void;
  onCardClick?: (card: GameCard) => void;
  isDiceRolling?: boolean;
  onOpenHand: () => void;
  allCards: Record<string, GameCard>;
}

const BottomPanel: React.FC<BottomPanelProps> = ({
  currentUser,
  players,
  isAdmin,
  gameState,
  onRoll,
  canRoll,
  currentTurnPlayerId,
  onPrevPhase,
  onNextPhase,
  onPrepareTurn,
  onResetGame,
  onConfirmRoll,
  canConfirmRoll,
  onToggleWheel,
  onCardClick,
  isDiceRolling,
  onOpenHand,
  allCards,
}) => {
  void onPrepareTurn;
  void onCardClick;
  const [isFillingResults, setIsFillingResults] = useState(false);
  const [tempScores, setTempScores] = useState<Record<string, number>>({});
  const [isPending, setIsPending] = useState(false);

  // Сбрасываем блокировку при любом изменении ключевых полей игрового состояния
  React.useEffect(() => {
    setIsPending(false);
  }, [gameState.phase, gameState.currentRoll, gameState.rollConfirmed, gameState.currentTurnIndex]);

  const handleAction = async (action: () => void | Promise<void>) => {
    if (isPending) return;
    setIsPending(true);
    try {
      await action();
    } catch (e) {
      console.error(e);
    } finally {
      setIsPending(false);
    }
  };

  const handleInitCards = async () => {
    if (!isAdmin) return;
    try {
      await uploadStarterCards();
      alert("Стартовые карты успешно загружены в базу данных.");
    } catch (e) {
      console.error("Ошибка инициализации карт:", e);
    }
  };

  // Находим логин текущего ходящего игрока
  const currentTurnPlayer = players.find(p => p.id === currentTurnPlayerId);

  // Cache the current user's player data and first card for safety and performance
  const myPlayerData = players.find(p => p.id === currentUser?.uid);
  const firstCardId = myPlayerData?.inventory?.[0];

  const isMyTurn = currentTurnPlayerId === currentUser?.uid;
  const turnLabel =
    gameState.turnOrder.length === 0
      ? "Свободный ход"
      : isMyTurn
        ? "Ход: ваш"
        : `Ход: ${currentTurnPlayer?.login || "ожидание..."}`;

  const rollLabel = isDiceRolling
    ? "Бросаем..."
    : (gameState.phase === "turn" && !isMyTurn && gameState.turnOrder.length > 0)
    ? "Ход другого игрока"
    : gameState.currentRoll !== null
    ? `Выпало: ${gameState.currentRoll}`
    : (gameState.rollBonus ?? 0) > 0
    ? `Бросить кубик (+${gameState.rollBonus})`
    : "🎲 Бросить кубик";

  const handleGiveAllCards = async () => {
    if (!isAdmin) return;
    try {
      const allCardIds = Object.keys(allCards);
      const targetPlayers = players.filter((p) => p.role !== "admin");
      const updates = targetPlayers.map((p) =>
        updateDoc(doc(db, "players", p.id), { inventory: allCardIds })
      );
      await Promise.all(updates);
      alert(`Выдано ${allCardIds.length} карт всем игрокам.`);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveResults = async () => {
    if (!isAdmin) return;
    try {
      const roundResults = Object.fromEntries(
        players
          .filter((player) => player.role !== "admin")
          .map((player) => [player.id, tempScores[player.id] ?? 0])
      );
      const playerUpdates = Object.entries(roundResults).map(([playerId, score]) =>
        updateDoc(doc(db, "players", playerId), {
          tiltCoins: increment(score),
          lastTiltoCoins: score,
          bonusPoints: 0,
        })
      );
      await Promise.all(playerUpdates);
      await updateDoc(doc(db, "gameState", "current"), { currentResults: roundResults });
      setIsFillingResults(false);
      onNextPhase();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="w-full h-40 border-t border-purple-500/20 bg-black/40 backdrop-blur-md flex flex-col relative overflow-hidden" style={{ fontFamily: "'Comfortaa', sans-serif" }}>
      {isPending && (
        <div className="absolute inset-0 z-[100] bg-black/40 backdrop-blur-[2px] flex items-center justify-center animate-in fade-in duration-300">
          <div className="flex items-center gap-3 bg-zinc-900 border border-white/10 px-6 py-3 rounded-2xl shadow-2xl">
            <div className="w-5 h-5 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-black uppercase tracking-widest text-yellow-500">Синхронизация...</span>
          </div>
        </div>
      )}

      {/* ВЕРХНЯЯ СТРОКА (Инфо и Кнопки) */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-purple-500/10 gap-3">
        <h3 className="text-purple-300 text-base font-bold uppercase tracking-tight shrink-0">
          Панель игры
        </h3>

        <div className="text-sm text-zinc-200 font-medium truncate">
          {gameState.phase === "waiting_game" ? (
             `Ожидание игры: ${gameState.currentGame || "..."}`
          ) : (
             `Этап: ${PHASE_LABELS[gameState.phase as keyof typeof PHASE_LABELS] || gameState.phase} | Раунд ${gameState.round}`
          )}
        </div>

        {gameState.phase === "turn" && (
          <div className="text-sm text-yellow-400 font-bold">{turnLabel}</div>
        )}

        {/* Блок подтверждения броска */}
        {gameState.currentRoll !== null && !gameState.rollConfirmed && canConfirmRoll && !isDiceRolling && (
          <button 
            onClick={() => void handleAction(onConfirmRoll)} 
            disabled={isPending}
            className="px-4 py-1.5 bg-yellow-600 hover:bg-yellow-500 rounded text-sm font-semibold transition animate-pulse disabled:opacity-50 disabled:cursor-wait"
          >
            Начать ход ({gameState.currentRoll})
          </button>
        )}

        {/* Кнопка броска для игрока */}
        {!isAdmin && (
          <button
            onClick={() => void handleAction(onRoll)}
            disabled={!canRoll || isDiceRolling || isPending}
            className={`px-6 py-2 rounded text-base font-bold transition ${
              canRoll && !isDiceRolling && !isPending ? "bg-purple-600 hover:bg-purple-500" : "bg-zinc-700 text-zinc-400 cursor-not-allowed"
            }`}
          >
            {rollLabel}
          </button>
        )}

        {/* Админ-кнопки */}
        {isAdmin && (
          <div className="flex gap-2 font-bold shrink-0">
            <button onClick={() => void handleAction(onPrevPhase)} disabled={isPending} className="bg-zinc-700 px-3 py-1 rounded text-xs disabled:opacity-50">Этап -</button>
            <button onClick={() => void handleAction(onNextPhase)} disabled={isPending} className="bg-zinc-700 px-3 py-1 rounded text-xs disabled:opacity-50">Этап +</button>
            
            {/* Тестовые кнопки */}
            <button onClick={handleInitCards} className="bg-slate-800 hover:bg-slate-700 border border-blue-500/30 px-3 py-1 rounded text-[10px] uppercase text-blue-300">
              Init
            </button>
            <button onClick={handleGiveAllCards} className="bg-slate-800 hover:bg-slate-700 border border-purple-500/30 px-3 py-1 rounded text-[10px] uppercase text-purple-300">
              Give All
            </button>
            <button
              onClick={() => {
                if (window.confirm("Сбросить gameState, поле, игроков и пересоздать карты в Firebase?")) {
                  void handleAction(async () => onResetGame?.());
                }
              }}
              disabled={isPending}
              className="bg-red-950 hover:bg-red-900 border border-red-500/40 px-3 py-1 rounded text-[10px] uppercase text-red-300 disabled:opacity-50"
            >
              Reset
            </button>

            {gameState.phase === "results" && (
              <button onClick={() => setIsFillingResults(!isFillingResults)} className="bg-blue-600 px-3 py-1 rounded text-xs">Итоги</button>
            )}
            {gameState.phase === "next_game" && (
              <button onClick={onToggleWheel} className="bg-purple-600 px-3 py-1 rounded text-xs">Колесо</button>
            )}
          </div>
        )}
      </div>

      {/* НИЖНЯЯ СЕКЦИЯ (Инвентарь / Очередь / Голосование) */}
      <div className="flex-1 px-4 py-3 flex items-center relative z-20">
        {/* Вид для Админа в фазе хода */}
        {isAdmin && gameState.phase === "turn" && (
          <div className="flex flex-col gap-1 w-full overflow-hidden">
            <span className="text-[10px] font-black uppercase text-purple-400 tracking-widest">Очередь:</span>
            <div className="flex items-center gap-2 overflow-x-auto">
              {gameState.turnOrder.map((pid, idx) => (
                <div key={pid} className={`px-3 py-1 rounded-lg border text-sm ${idx === gameState.currentTurnIndex ? "bg-yellow-500/20 border-yellow-500" : "bg-zinc-900/60 border-white/5 opacity-50"}`}>
                  {players.find(p => p.id === pid)?.login || "???"}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ввод результатов Админом */}
        {isAdmin && isFillingResults && (
          <div className="flex gap-4 items-center overflow-x-auto w-full">
            {players.filter(p => p.role !== "admin").map(p => (
              <div key={p.id} className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-zinc-500">{p.login}</span>
                <input
                  type="number"
                  className="w-12 bg-black border border-zinc-700 rounded text-center text-xs text-yellow-400"
                  value={tempScores[p.id] ?? 0}
                  onChange={(e) => setTempScores(prev => ({ ...prev, [p.id]: parseInt(e.target.value) || 0 }))}
                />
              </div>
            ))}
            <button onClick={handleSaveResults} className="bg-green-600 px-4 py-2 rounded-xl text-xs font-bold">Сохранить</button>
          </div>
        )}

        {/* Вид для Игрока (Инвентарь) */}
        {!isAdmin && gameState.phase !== "voting" && (
          <div className="flex flex-col gap-1 w-full">
            <span className="text-[10px] font-black uppercase text-purple-400 tracking-widest">Ваш инвентарь:</span>
            <div className="flex-1 flex items-end pb-1 overflow-visible">
              {myPlayerData?.inventory?.length ? (
                <div
                  onClick={onOpenHand}
                  className="relative group cursor-pointer w-16 h-20 rounded-xl border-2 border-white/20 overflow-hidden transition-all hover:-translate-y-2 hover:scale-110 shadow-2xl"
                  style={{
                    backgroundImage: `url("${firstCardId ? allCards[firstCardId]?.faceCard : ''}"), linear-gradient(165deg, #4b5563 0%, #000 100%)`,
                    backgroundSize: "cover"
                  }}
                >
                  <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center">
                    <span className="text-white text-lg font-black">{myPlayerData.inventory.length}</span>
                  </div>
                </div>
              ) : (
                <span className="text-xs text-zinc-600 italic">Нет карт...</span>
              )}
            </div>
          </div>
        )}

        {/* Голосование */}
        {gameState.phase === "voting" && (
          isAdmin ? (
            <AdminVotingView gameState={gameState} players={players} onFinish={onNextPhase} />
          ) : (
            <PlayerVotingView currentUser={currentUser} players={players} gameState={gameState} />
          )
        )}
      </div>
    </div>
  );
};

// Вспомогательные компоненты для чистоты кода
const PlayerVotingView: React.FC<{ currentUser: User | null, players: Player[], gameState: GameState }> = ({ currentUser, players, gameState }) => {
  const myId = currentUser?.uid;
  if (!myId) return null;
  const myPlayerData = players.find(p => p.id === myId);
  const hasVoted = !!gameState.votes?.[myId];

  if ((myPlayerData?.lastTiltoCoins ?? 0) <= 0) return <div className="text-zinc-500 italic text-xs">Вы не участвовали в игре и не можете голосовать.</div>;

  if (hasVoted) return <div className="text-indigo-300 text-xs">Голос принят!</div>;

  return (
    <div className="flex gap-2 overflow-x-auto">
      {players.filter(p => p.role !== "admin" && (p.lastTiltoCoins ?? 0) > 0).map(p => (
        <button
          key={p.id}
          onClick={() => updateDoc(doc(db, "gameState", "current"), { [`votes.${myId}`]: p.id })}
          className="bg-indigo-600 px-3 py-1 rounded text-[10px] uppercase font-bold"
        >
          {p.login}
        </button>
      ))}
    </div>
  );
};

const AdminVotingView: React.FC<{ gameState: GameState, players: Player[], onFinish: () => void }> = ({ gameState, players, onFinish }) => {
  void players;
  const handleFinish = async () => {
    const currentVotes = gameState.votes || {};
    const voteCounts: Record<string, number> = {};
    Object.values(currentVotes).forEach((vid) => { voteCounts[vid as string] = (voteCounts[vid as string] || 0) + 1; });
    
    const entries = Object.entries(voteCounts);
    if (entries.length > 0) {
      const max = Math.max(...Object.values(voteCounts));
      const winners = entries.filter(([, count]) => count === max).map(([id]) => id);
      const bonus = winners.length === 1 ? 3 : (winners.length === 2 ? 2 : 1);

      await Promise.all(winners.map(wid => updateDoc(doc(db, "players", wid), {
        tiltCoins: increment(bonus),
        bonusPoints: bonus
      })));
    }
    await updateDoc(doc(db, "gameState", "current"), { votes: {} });
    onFinish();
  };

  return (
    <div className="flex gap-4 items-center">
      <div className="text-xs text-indigo-300">Проголосовало: {Object.keys(gameState.votes || {}).length}</div>
      <button onClick={handleFinish} className="bg-green-600 px-4 py-2 rounded-lg text-xs font-black uppercase">Завершить</button>
    </div>
  );
};

export default BottomPanel;
