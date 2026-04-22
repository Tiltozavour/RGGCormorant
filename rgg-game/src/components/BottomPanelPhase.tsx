import React, { useState, useEffect } from "react";
import type { GameCard } from "../types/card";
import type { GameState, Player } from "../types/game";
import type { User } from "firebase/auth";
import { doc, updateDoc, increment, arrayUnion } from "firebase/firestore";
import { db } from "../firebase";
import { uploadStarterCards } from "../types/cardService";

interface BottomPanelPhaseProps {
  currentUser: User | null;
  players: Player[]; // Добавляем игроков в пропсы
  isAdmin: boolean;
  gameState: GameState;
  onRoll: () => void;
  canRoll: boolean;
  currentTurnPlayerId: string | null;
  onPrevPhase: () => void;
  onNextPhase: () => void;
  onPrepareTurn: () => void;
  onConfirmRoll: () => void;
  canConfirmRoll: boolean;
  onToggleWheel?: () => void;
  onCardClick: (card: GameCard) => void;
  onOpenHand: () => void;
  allCards: Record<string, GameCard>;
}

const BottomPanelPhase: React.FC<BottomPanelPhaseProps> = ({
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
  onConfirmRoll,
  canConfirmRoll,
  onToggleWheel,
  onCardClick,
  onOpenHand, // Извлекаем onOpenHand из пропсов
  allCards,
}) => {
  const [isFillingResults, setIsFillingResults] = useState(false);
  const [tempScores, setTempScores] = useState<Record<string, number>>({});

  const handleTestGetCards = async () => {
    if (!currentUser) return;
    try {
      const playerRef = doc(db, "players", currentUser.uid);
      await updateDoc(playerRef, {
        inventory: arrayUnion("inv_006", "inv_007")
      });
    } catch (e) {
      console.error("Ошибка при доборе тестовых карт:", e);
    }
  };

  // Функция для выдачи всех существующих карт всем игрокам (кроме админов)
  const handleGiveAllCards = async () => {
    if (!isAdmin) return;

    try {
      const allCardIds = Object.keys(allCards);
      
      // Находим всех игроков, которые не являются админами
      const targetPlayers = players.filter(p => p.role !== 'admin');

      const updates = targetPlayers.map(p => 
        updateDoc(doc(db, "players", p.id), {
          inventory: allCardIds
        })
      );

      await Promise.all(updates);
      alert(`Все карты (${allCardIds.length} шт.) выданы игрокам (${targetPlayers.length} чел.).`);
    } catch (error: any) { // Добавляем type assertion для error
      console.error("Ошибка при выдаче всех карт:", error);
      alert("Ошибка при выдаче всех карт: " + error.message);
    }
  };

  // Синхронизируем локальный ввод с данными из базы при открытии формы
  useEffect(() => {
    if (isFillingResults) {
      setTempScores(gameState.currentResults || {});
    }
  }, [isFillingResults, gameState.currentResults]);

  const handleSaveResults = async () => {
    if (!isAdmin) return;
    try {
      // 1. Обновляем монеты, записываем последний результат и обнуляем старые бонусы
      const playerUpdates = Object.entries(tempScores).map(([playerId, score]) => {
        return updateDoc(doc(db, "players", playerId), {
          tiltCoins: increment(score),
          lastTiltoCoins: score,
          bonusPoints: 0
        });
      });

      await Promise.all(playerUpdates);

      // 2. Сохраняем промежуточные результаты в состояние игры
      await updateDoc(doc(db, "gameState", "current"), {
        currentResults: tempScores
      });
      
      setIsFillingResults(false);
      // 3. Автоматически переходим к следующему этапу (голосованию)
      onNextPhase();
    } catch (e) {
      console.error("Ошибка сохранения результатов:", e);
    }
  };

  const turnLabel =
    gameState.turnOrder.length === 0
      ? "Свободный ход"
      : currentTurnPlayerId === currentUser?.uid
        ? "Ход: ваш"
        : "Ход: другой игрок";

  const me = players.find(p => p.id === currentUser?.uid);

  const rollLabel =
    gameState.currentRoll !== null
      ? `Выпало: ${gameState.currentRoll}`
      : me?.isFrozen
        ? "❄️ ЗАМОРОЖЕН"
        : gameState.phase !== "turn"
          ? "Ход недоступен"
          : (gameState.rollBonus ?? 0) > 0
            ? `Бросить кубик (+${gameState.rollBonus})`
            : "Бросить кубик";

  return (
    <div className="w-full h-40 border-t border-purple-500/20 bg-black/40 backdrop-blur-md flex flex-col" style={{ fontFamily: "'Comfortaa', sans-serif" }}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-purple-500/10 gap-3">
        <h3 className="text-purple-300 text-base font-bold uppercase tracking-tight shrink-0">Панель игры</h3>
        <div className="text-sm text-zinc-200 font-medium truncate">
          {gameState.phase === "waiting_game" && `Этап: Ожидание проведения игры "${gameState.currentGame || "..."}" | Этап ${gameState.round}`}
          {gameState.phase === "playing" && `Этап: Играем в "${gameState.currentGame || "..."}" | Этап ${gameState.round}`}
          {gameState.phase === "results" && `Этап: Подводим итоги игры | Этап ${gameState.round}`}
          {gameState.phase === "voting" && `Этап: Ожидаем пока игроки проголосуют... | Этап ${gameState.round}`}
          {gameState.phase === "turn" && `Этап: Ход на поле | Этап ${gameState.round}`}
          {gameState.phase === "next_game" && `Этап: Выбирается следующая игра... | Этап ${gameState.round}`}
        </div>

        {gameState.phase === "turn" && (
          <div className="text-sm text-yellow-400 font-bold">{turnLabel}</div>
        )}

        {gameState.currentRoll !== null &&
          !gameState.rollConfirmed &&
          canConfirmRoll && (
            <div className="flex items-center gap-3 bg-yellow-900/40 border border-yellow-500/30 px-4 py-2 rounded-xl shadow-[0_0_20px_rgba(250,195,25,0.2)]">
              <span className="text-base text-yellow-200 flex items-center gap-2">
                Выпало: 
                <b className="text-2xl tracking-tighter">
                  {gameState.lastBaseRoll}
                  {gameState.currentRoll !== gameState.lastBaseRoll && (
                    <span className="text-green-400 text-lg ml-1">
                      + {gameState.currentRoll! - (gameState.lastBaseRoll || 0)}
                    </span>
                  )}
                </b>
              </span>
              <button
                onClick={onConfirmRoll}
                className="px-4 py-1.5 bg-yellow-600 hover:bg-yellow-500 rounded text-sm font-semibold transition"
              >
                Начать ход
              </button>
            </div>
          )}

        {gameState.currentRoll !== null &&
          !gameState.rollConfirmed &&
          !canConfirmRoll && (
            <div className="flex items-center gap-2 bg-yellow-900/20 border border-yellow-500/10 px-3 py-1 rounded">
              <span className="text-sm text-yellow-400">
                Игрок выбирает ход...
              </span>
            </div>
          )}

        {gameState.currentRoll !== null && gameState.rollConfirmed && (
          <div className="flex items-center gap-2 bg-purple-900/50 px-3 py-1 rounded">
            <span className="text-sm text-purple-300">
              Ход: {gameState.currentRoll}
            </span>
          </div>
        )}

        {!isAdmin && (
          <button
            onClick={onRoll}
            disabled={!canRoll}
            className={`px-6 py-2 rounded text-base font-bold transition ${
              canRoll
                ? "bg-purple-600 hover:bg-purple-500"
                : "bg-zinc-700 text-zinc-400 cursor-not-allowed"
            }`}
          >
            {rollLabel}
          </button>
        )}

        {isAdmin && (
          <div className="flex gap-2 font-bold shrink-0">
            <button
              onClick={() => {
                if (window.confirm("Загрузить стартовые карты в Firestore? Это обновит существующие данные.")) {
                  uploadStarterCards()
                    .then(() => alert("Карты успешно инициализированы!"))
                    .catch((err) => alert("Ошибка: " + err.message));
                }
              }}
              className="bg-zinc-700 hover:bg-zinc-600 active:scale-95 transition-all px-4 py-1.5 rounded text-sm font-bold shadow-md border border-white/10"
              title="Загрузить коллекцию cards из JSON"
            >
              🛠️ Инит Карт
            </button>
            <button
              onClick={handleGiveAllCards} // Новая кнопка для выдачи всех карт
              className="bg-green-700 hover:bg-green-600 active:scale-95 transition-all px-4 py-1.5 rounded text-sm font-bold shadow-md border border-white/10"
              title="Выдать текущему игроку все существующие карты"
            >
              🎴 Все карты
            </button>

            {gameState.phase === "next_game" && (
              <button
                onClick={() => {
                  console.log("Нажатие на 🎡. Пропс onToggleWheel существует?", !!onToggleWheel);
                  onToggleWheel?.();
                }}
                className="bg-purple-600 hover:bg-purple-500 active:scale-95 px-4 py-1.5 rounded text-sm flex items-center gap-1 transition-all"
              >
                🎡 Колесо
              </button>
            )}
            <button
              onClick={onPrevPhase}
              className="bg-yellow-700 hover:bg-yellow-600 active:scale-95 transition-all px-4 py-1.5 rounded text-sm font-bold shadow-md hover:shadow-yellow-500/20"
            >
              Этап -
            </button>
            <button
              onClick={onNextPhase}
              className="bg-yellow-600 hover:bg-yellow-500 active:scale-95 transition-all px-4 py-1.5 rounded text-sm font-bold shadow-md hover:shadow-yellow-400/20"
            >
              Этап +
            </button>
            
            {gameState.phase === "results" && (
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsFillingResults(!isFillingResults)}
                  className="bg-blue-600 hover:bg-blue-500 active:scale-95 transition-all px-4 py-1.5 rounded text-sm font-bold shadow-md"
                >
                  {isFillingResults ? "Закрыть ввод" : "Заполнить результаты игры"}
                </button>
              </div>
            )}

            {gameState.phase === "voting" && <AdminVotingView gameState={gameState} players={players} onFinish={onNextPhase} />}

            {gameState.phase === "turn" && (
              <button
                onClick={onPrepareTurn}
                className="bg-green-600 hover:bg-green-500 active:scale-95 transition-all px-4 py-1.5 rounded text-sm font-bold shadow-md shadow-green-500/10"
              >
                Подготовить ход
              </button>
            )}
          </div>
        )}
      </div>

      {/* Контентная область */}
      <div className="flex-1 px-4 py-3 text-base text-zinc-200 flex items-center relative z-20 overflow-visible">
        {/* Очередь ходов для админа в фазе turn */}
        {isAdmin && gameState.phase === "turn" && gameState.turnOrder.length > 0 && (
          <div className="flex flex-col gap-2 w-full animate-in fade-in slide-in-from-left-4 duration-500 overflow-hidden">
            <span className="text-[10px] font-black uppercase text-purple-400 tracking-widest px-1">Очередь ходов:</span>
            <div className="flex items-center gap-2">
              {gameState.turnOrder.map((pid, idx) => {
                const p = players.find(player => player.id === pid);
                const isCurrent = idx === gameState.currentTurnIndex;
                const isDone = idx < gameState.currentTurnIndex;

                return (
                  <React.Fragment key={pid}>
                    <div className={`
                      flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all
                      ${isCurrent 
                        ? "bg-yellow-500/20 border-yellow-500 shadow-[0_0_15px_rgba(250,195,25,0.3)] scale-105 z-10" 
                        : isDone ? "bg-zinc-800/40 border-zinc-700 opacity-50" : "bg-zinc-900/60 border-white/5"}
                    `}>
                      <span className={`text-xs font-black ${isCurrent ? "text-yellow-400" : "text-zinc-500"}`}>
                        {idx + 1}
                      </span>
                      <span className={`text-sm font-bold ${isCurrent ? "text-white" : "text-zinc-400"}`}>
                        {p?.login || "???"}
                      </span>
                    </div>
                    {idx < gameState.turnOrder.length - 1 && (
                      <span className="text-zinc-700 font-light">→</span>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {isFillingResults && gameState.phase === "results" && isAdmin && (
          <div className="flex gap-4 items-center min-w-max animate-in fade-in slide-in-from-bottom-2 duration-300">
            {players.filter(p => p.role !== 'admin').map(player => (
              <div key={player.id} className="bg-zinc-900/60 p-2 rounded-xl border border-purple-500/20 flex flex-col items-center gap-1 min-w-[100px]">
                <span className="text-[10px] uppercase font-black text-zinc-500 truncate w-20 text-center">{player.login}</span>
                <input 
                  type="number" 
                  title={`Очки для ${player.login}`}
                  className="w-16 bg-black border border-zinc-700 rounded text-center text-sm p-1 text-yellow-400 font-bold focus:border-yellow-500 outline-none transition-colors"
                  value={tempScores[player.id] ?? 0}
                  onChange={e => setTempScores(prev => ({...prev, [player.id]: parseInt(e.target.value) || 0}))}
                />
              </div>
            ))}
            <div className="flex gap-2">
              <button 
                onClick={() => setTempScores({})}
                className="bg-zinc-800 hover:bg-red-900/60 border border-zinc-700 hover:border-red-500/50 active:scale-95 px-4 py-2 rounded-xl font-bold text-sm transition-all uppercase tracking-tighter text-zinc-400 hover:text-white"
              >
                Сбросить
              </button>
              <button 
                onClick={handleSaveResults}
                className="bg-green-600 hover:bg-green-500 px-6 py-2 rounded-xl font-bold text-sm transition-all shadow-lg hover:scale-105 active:scale-95 uppercase tracking-tighter"
              >
                Сохранить результаты
              </button>
            </div>
          </div>
        )}

        {/* Интерфейс голосования для обычных игроков */}
        {!isAdmin && gameState.phase === "voting" && (
          <PlayerVotingView 
            currentUser={currentUser} 
            players={players} 
            gameState={gameState} 
          />
        )}

        {/* Инвентарь для обычных игроков (не админов) */}
        {!isAdmin && gameState.phase !== "voting" && (
          <div className="flex flex-col gap-1 w-full animate-in fade-in slide-in-from-left-4 duration-500 overflow-visible">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase text-purple-400 tracking-widest px-1">Ваш инвентарь:</span>
              {/* Кнопка "Тест добор" теперь всегда справа */}
              <button 
                onClick={handleTestGetCards}
                className="ml-auto text-[8px] bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 px-2 py-0.5 rounded text-purple-400/60 hover:text-purple-300 transition-all uppercase font-black"
                title="Добавить тестовые карты inv_006 и inv_007"
              >
                🧪 Тест добор
              </button>
            </div>
            <div className="flex-1 flex items-end pb-1 px-1 overflow-visible min-h-[100px]">
              {me?.inventory && me.inventory.length > 0 ? (
                /* Режим закрытой колоды */
                <div 
                  onClick={onOpenHand} // Клик на колоду открывает полноэкранную ленту
                  className="relative group cursor-pointer w-20 h-24 rounded-xl border-2 border-white/20 overflow-hidden transition-all duration-300 hover:-translate-y-2 hover:scale-110 shadow-2xl animate-in zoom-in-90"
                  style={{ 
                    backgroundImage: `url("${allCards[me.inventory[0]]?.faceCard}"), linear-gradient(165deg, #4b5563 0%, #000 100%)`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                  }}
                >
                  <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-white text-xl font-black drop-shadow-md">{me.inventory.length}</span>
                    <span className="text-[7px] text-white/70 uppercase font-bold tracking-tighter">В колоде</span>
                  </div>
                  <div className="absolute -right-1 -top-1 w-full h-full border-r border-t border-white/10 -z-10 rounded-xl shadow-lg" />
                  <div className="absolute -right-2 -top-2 w-full h-full border-r border-t border-white/5 -z-20 rounded-xl" />
                </div>
              ) : (
                <span className="text-xs text-zinc-600 italic px-1">У вас пока нет карт...</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Компонент голосования для игрока
 */
const PlayerVotingView: React.FC<{ currentUser: User | null, players: Player[], gameState: GameState }> = ({ currentUser, players, gameState }) => {
  const myId = currentUser?.uid;
  if (!myId) return null;

  const myPlayerData = players.find(p => p.id === myId);
  const isParticipating = (myPlayerData?.lastTiltoCoins ?? 0) > 0;
  const hasVoted = !!gameState.votes?.[myId];

  if (!isParticipating) {
    return <div className="text-zinc-500 italic">Вы не участвовали в этой игре, поэтому не можете голосовать.</div>;
  }

  if (hasVoted) {
    const votedFor = players.find(p => p.id === gameState.votes?.[myId]);
    return (
      <div className="flex items-center gap-3 bg-indigo-900/30 px-4 py-2 rounded-xl border border-indigo-500/30 animate-in fade-in zoom-in duration-300">
        <span className="text-indigo-200">Ваш голос принят за:</span>
        <b className="text-white uppercase">{votedFor?.login || "???"}</b>
      </div>
    );
  }

  // Кандидаты — те, кто участвовал (очки > 0)
  const candidates = players.filter(p => p.role !== 'admin' && (p.lastTiltoCoins ?? 0) > 0);

  const handleVote = async (targetId: string) => {
    await updateDoc(doc(db, "gameState", "current"), {
      [`votes.${myId}`]: targetId
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Выберите лучшего игрока:</span>
      <div className="flex gap-2">
        {candidates.map(c => (
          <button
            key={c.id}
            onClick={() => handleVote(c.id)}
            className="bg-indigo-600 hover:bg-white hover:text-indigo-900 active:scale-90 text-white px-3 py-1.5 rounded-lg text-xs font-black transition-all uppercase shadow-lg hover:shadow-indigo-500/40"
          >
            {c.login}
          </button>
        ))}
      </div>
    </div>
  );
};

/**
 * Компонент управления голосованием для админа
 */
const AdminVotingView: React.FC<{ gameState: GameState, players: Player[], onFinish: () => void }> = ({ gameState, players, onFinish }) => {
  const [showDetails, setShowDetails] = useState(false);

  const handleFinishVoting = async () => {
    const currentVotes = gameState.votes || {};
    
    // Игроки, которые участвуют в раунде (счет > 0), но еще не проголосовали
    const currentNonVoters = players.filter(p => 
      p.role !== 'admin' && 
      (p.lastTiltoCoins ?? 0) > 0 && 
      !currentVotes[p.id]
    );

    let skipBonuses = false;
    if (currentNonVoters.length > 0) {
      const names = currentNonVoters.map(v => v.login).join(", ");
      if (!window.confirm(`Точно завершить голосование? Еще не проголосовали: ${names}.\nВ этом случае бонусы начислены не будут.`)) {
        return;
      }
      skipBonuses = true;
    }

    if (!skipBonuses) {
      const voteCounts: Record<string, number> = {};
      // Считаем голоса
      Object.values(currentVotes).forEach(votedId => {
        voteCounts[votedId] = (voteCounts[votedId] || 0) + 1;
      });

      const voteEntries = Object.entries(voteCounts);
      if (voteEntries.length > 0) {
        // Находим максимум
        const maxVotes = Math.max(...Object.values(voteCounts));
        const winners = voteEntries
          .filter(([, count]) => count === maxVotes)
          .map(([id]) => id);

        // Определяем баллы
        let bonus = 0;
        if (winners.length === 1) bonus = 3;
        else if (winners.length === 2) bonus = 2;
        else if (winners.length > 2) bonus = 1;

        // Обновляем игроков
        const updates = winners.map(winnerId => {
          return updateDoc(doc(db, "players", winnerId), {
            tiltCoins: increment(bonus),
            bonusPoints: bonus
          });
        });

        await Promise.all(updates);
      }
    }

    // Очищаем голоса в БД
    await updateDoc(doc(db, "gameState", "current"), {
      votes: {}
    });

    onFinish();
  };

  // Игроки, которые участвуют в раунде (счет > 0), но еще не проголосовали
  const nonVoters = players.filter(p => 
    p.role !== 'admin' && 
    (p.lastTiltoCoins ?? 0) > 0 && 
    !gameState.votes?.[p.id]
  );

  return (
    <div className="flex gap-2">
      <button 
        onClick={() => setShowDetails(!showDetails)}
        className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all px-4 py-1.5 rounded text-sm font-bold shadow-md"
      >
        {showDetails ? "Скрыть голоса" : "Посмотреть голосование"}
      </button>
      <button 
        onClick={handleFinishVoting}
        className="bg-green-600 hover:bg-green-500 active:scale-95 transition-all px-4 py-1.5 rounded text-sm font-bold shadow-[0_0_15px_rgba(34,197,94,0.3)] hover:shadow-green-400/40"
      >
        Завершить и начислить
      </button>

      {showDetails && (
        <div className="fixed bottom-44 right-4 bg-zinc-900 border border-indigo-500/30 p-4 rounded-2xl shadow-2xl min-w-[200px] animate-in slide-in-from-right-4 duration-300">
          <h4 className="text-indigo-400 font-bold text-xs uppercase mb-3">Текущие голоса:</h4>
          <div className="space-y-2">
            {players.filter(p => p.role !== 'admin').map(p => {
              const count = Object.values(gameState.votes || {}).filter(id => id === p.id).length;
              if (count === 0) return null;
              return (
                <div key={p.id} className="flex justify-between items-center text-xs">
                  <span className="text-zinc-300">{p.login}</span>
                  <span className="bg-indigo-500 text-white px-2 py-0.5 rounded-full font-bold">{count}</span>
                </div>
              );
            })}
          </div>

          {nonVoters.length > 0 && (
            <div className="mt-4 pt-3 border-t border-white/10">
              <h5 className="text-[10px] text-red-400 font-bold uppercase mb-2">Ожидаем голос от:</h5>
              <div className="flex flex-wrap gap-1">
                {nonVoters.map(v => (
                  <span key={v.id} className="text-[10px] text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded border border-white/5">
                    {v.login}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>

  );
  
};


export default BottomPanelPhase;
