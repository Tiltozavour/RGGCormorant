import React, { useState } from "react";
import type { GameCard } from "../types/card";
import type { GameState, Player } from "../types/game";
import type { User } from "firebase/auth";
import { arrayUnion, doc, updateDoc, increment, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { uploadStarterCards } from "../types/cardService";
import { PHASE_LABELS } from "./gameConstants";
import { ru } from "../i18n/ru";
import AdminDialog from "./AdminDialog";

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
  const [dialog, setDialog] = useState<{
    title: string;
    message: string;
    danger?: boolean;
    onConfirm?: () => void | Promise<void>;
  } | null>(null);

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
      setDialog({
        title: ru.bottomPanel.initCardsTitle,
        message: ru.bottomPanel.initCardsSuccess,
      });
    } catch (e) {
      console.error(ru.bottomPanel.initCardsError, e);
    }
  };

  // Находим логин текущего ходящего игрока
  const currentTurnPlayer = players.find(p => p.id === currentTurnPlayerId);

  // Cache the current user's player data and first card for safety and performance
  const myPlayerData = players.find(p => p.id === currentUser?.uid);
  const hasGoldenCard = (gameState.goldenCardHolderIds ?? []).includes(currentUser?.uid ?? "");
  const displayedInventoryCount = (myPlayerData?.inventory?.length ?? 0) + (hasGoldenCard ? 1 : 0);
  const firstCardId = hasGoldenCard ? "inv_018" : myPlayerData?.inventory?.[0];

  const isMyTurn = currentTurnPlayerId === currentUser?.uid;
  const turnLabel =
    gameState.turnOrder.length === 0
      ? ru.bottomPanel.freeTurn
      : isMyTurn
        ? ru.bottomPanel.yourTurn
        : ru.bottomPanel.turnOf(currentTurnPlayer?.login || ru.bottomPanel.waitingTurn);

  const rollLabel = isDiceRolling
    ? ru.bottomPanel.rolling
    : (gameState.phase === "turn" && !isMyTurn && gameState.turnOrder.length > 0)
    ? ru.bottomPanel.otherPlayerTurn
    : gameState.currentRoll !== null
    ? ru.bottomPanel.rollResult(gameState.currentRoll)
    : (gameState.rollBonus ?? 0) > 0
    ? ru.bottomPanel.rollWithBonus(gameState.rollBonus)
    : ru.bottomPanel.rollDice;

  const handleGiveAllCards = async () => {
    if (!isAdmin) return;
    try {
      const allCardIds = Object.keys(allCards);
      const targetPlayers = players.filter((p) => p.role !== "admin");
      const updates = targetPlayers.map((p) =>
        updateDoc(doc(db, "players", p.id), { inventory: allCardIds })
      );
      await Promise.all(updates);
      setDialog({
        title: ru.bottomPanel.giveAllCardsTitle,
        message: ru.bottomPanel.giveAllCardsSuccess(allCardIds.length),
      });
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
      const batch = writeBatch(db);
      Object.entries(roundResults).forEach(([playerId, score]) => {
        batch.update(doc(db, "players", playerId), {
          tiltCoins: increment(score),
          lastTiltoCoins: score,
          bonusPoints: 0,
        });
      });
      batch.update(doc(db, "gameState", "current"), { currentResults: roundResults });
      await batch.commit();
      setIsFillingResults(false);
      onNextPhase();
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddPlayerToTurnQueue = async (playerId: string) => {
    if (!isAdmin || gameState.turnOrder.includes(playerId)) return;
    await updateDoc(doc(db, "gameState", "current"), {
      turnOrder: [...gameState.turnOrder, playerId],
    });
  };

  return (
    <div className="w-full h-40 border-t border-purple-500/20 bg-black/40 backdrop-blur-md flex flex-col relative overflow-hidden" style={{ fontFamily: "'Comfortaa', sans-serif" }}>
      {isPending && (
        <div className="absolute inset-0 z-[100] bg-black/40 backdrop-blur-[2px] flex items-center justify-center animate-in fade-in duration-300">
          <div className="flex items-center gap-3 bg-zinc-900 border border-white/10 px-6 py-3 rounded-2xl shadow-2xl">
            <div className="w-5 h-5 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-black uppercase tracking-widest text-yellow-500">{ru.bottomPanel.sync}</span>
          </div>
        </div>
      )}

      {/* ВЕРХНЯЯ СТРОКА (Инфо и Кнопки) */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-purple-500/10 gap-3">
        <h3 className="text-purple-300 text-base font-bold uppercase tracking-tight shrink-0">
          {ru.bottomPanel.title}
        </h3>

        <div className="text-sm text-zinc-200 font-medium truncate">
          {gameState.phase === "waiting_game" ? (
             ru.bottomPanel.waitingGame(gameState.currentGame)
          ) : (
             ru.bottomPanel.phaseRound(PHASE_LABELS[gameState.phase as keyof typeof PHASE_LABELS] || gameState.phase, gameState.round)
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
            {ru.bottomPanel.confirmRoll(gameState.currentRoll)}
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
            <button onClick={() => void handleAction(onPrevPhase)} disabled={isPending} className="bg-zinc-700 px-3 py-1 rounded text-xs disabled:opacity-50">{ru.bottomPanel.phasePrev}</button>
            <button onClick={() => void handleAction(onNextPhase)} disabled={isPending} className="bg-zinc-700 px-3 py-1 rounded text-xs disabled:opacity-50">{ru.bottomPanel.phaseNext}</button>
            
            {/* Тестовые кнопки */}
            <button onClick={handleInitCards} className="bg-slate-800 hover:bg-slate-700 border border-blue-500/30 px-3 py-1 rounded text-[10px] uppercase text-blue-300">
              Init
            </button>
            <button onClick={handleGiveAllCards} className="bg-slate-800 hover:bg-slate-700 border border-purple-500/30 px-3 py-1 rounded text-[10px] uppercase text-purple-300">
              Give All
            </button>
            <button
              onClick={() => {
                setDialog({
                  title: ru.bottomPanel.resetTitle,
                  message: ru.bottomPanel.resetConfirm,
                  danger: true,
                  onConfirm: () => handleAction(async () => onResetGame?.()),
                });
              }}
              disabled={isPending}
              className="bg-red-950 hover:bg-red-900 border border-red-500/40 px-3 py-1 rounded text-[10px] uppercase text-red-300 disabled:opacity-50"
            >
              Reset
            </button>

            {gameState.phase === "results" && (
              <button onClick={() => setIsFillingResults(!isFillingResults)} className="bg-blue-600 px-3 py-1 rounded text-xs">{ru.bottomPanel.results}</button>
            )}
            {gameState.phase === "next_game" && (
              <button onClick={onToggleWheel} className="bg-purple-600 px-3 py-1 rounded text-xs">{ru.bottomPanel.wheel}</button>
            )}
          </div>
        )}
      </div>

      {/* НИЖНЯЯ СЕКЦИЯ (Инвентарь / Очередь / Голосование) */}
      <div className="flex-1 px-4 py-3 flex items-center relative z-20">
        {/* Вид для Админа в фазе хода */}
        {isAdmin && gameState.phase === "turn" && (
          <div className="flex flex-col gap-1 w-full overflow-hidden">
            <span className="text-[10px] font-black uppercase text-purple-400 tracking-widest">{ru.bottomPanel.queue}</span>
            <div className="flex items-center gap-2 overflow-x-auto">
              {gameState.turnOrder.map((pid, idx) => (
                <div key={pid} className={`px-3 py-1 rounded-lg border text-sm ${idx === gameState.currentTurnIndex ? "bg-yellow-500/20 border-yellow-500" : "bg-zinc-900/60 border-white/5 opacity-50"}`}>
                  {players.find(p => p.id === pid)?.login || "???"}
                </div>
              ))}
            </div>
            {players.some((player) => player.role !== "admin" && !gameState.turnOrder.includes(player.id) && (gameState.currentResults?.[player.id] ?? player.lastTiltoCoins ?? 0) <= 0) && (
              <div className="mt-1 flex items-center gap-2 overflow-x-auto">
                <span className="text-[9px] uppercase tracking-widest text-zinc-500">{ru.bottomPanel.zeroPoints}</span>
                {players
                  .filter((player) => player.role !== "admin" && !gameState.turnOrder.includes(player.id) && (gameState.currentResults?.[player.id] ?? player.lastTiltoCoins ?? 0) <= 0)
                  .map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => void handleAddPlayerToTurnQueue(player.id)}
                      className="rounded-md border border-white/10 bg-zinc-900/70 px-2 py-0.5 text-[10px] text-zinc-300 transition hover:border-yellow-400/50 hover:text-yellow-200"
                    >
                      + {player.login}
                    </button>
                  ))}
              </div>
            )}
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
            <button onClick={handleSaveResults} className="bg-green-600 px-4 py-2 rounded-xl text-xs font-bold">{ru.bottomPanel.save}</button>
          </div>
        )}

        {/* Вид для Игрока (Инвентарь) */}
        {!isAdmin && gameState.phase !== "voting" && (
          <div className="flex flex-col gap-1 w-full">
            <span className="text-[10px] font-black uppercase text-purple-400 tracking-widest">{ru.bottomPanel.inventory}</span>
            <div className="flex-1 flex items-end pb-1 overflow-visible">
              {displayedInventoryCount > 0 ? (
                <div
                  onClick={onOpenHand}
                  className="relative group cursor-pointer w-16 h-20 rounded-xl border-2 border-white/20 overflow-hidden transition-all hover:-translate-y-2 hover:scale-110 shadow-2xl"
                  style={{
                    backgroundImage: `url("${firstCardId ? allCards[firstCardId]?.faceCard : ''}"), linear-gradient(165deg, #4b5563 0%, #000 100%)`,
                    backgroundSize: "cover"
                  }}
                >
                  <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center">
                    <span className="text-white text-lg font-black">{displayedInventoryCount}</span>
                    {hasGoldenCard && (
                      <span className="mt-0.5 rounded bg-yellow-400/90 px-1 text-[8px] font-black text-black">★</span>
                    )}
                  </div>
                </div>
              ) : (
                <span className="text-xs text-zinc-600 italic">{ru.bottomPanel.emptyHand}</span>
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
      <AdminDialog
        isOpen={Boolean(dialog)}
        variant={dialog?.onConfirm ? "confirm" : "info"}
        title={dialog?.title ?? ""}
        message={dialog?.message}
        confirmLabel={dialog?.onConfirm ? ru.bottomPanel.confirm : ru.bottomPanel.ok}
        cancelLabel={ru.bottomPanel.cancel}
        danger={dialog?.danger}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          const action = dialog?.onConfirm;
          setDialog(null);
          if (action) void action();
        }}
      />
    </div>
  );
};

// Вспомогательные компоненты для чистоты кода
const PlayerVotingView: React.FC<{ currentUser: User | null, players: Player[], gameState: GameState }> = ({ currentUser, players, gameState }) => {
  const myId = currentUser?.uid;
  if (!myId) return null;
  const myPlayerData = players.find(p => p.id === myId);
  const hasVoted = !!gameState.votes?.[myId];

  if ((myPlayerData?.lastTiltoCoins ?? 0) <= 0) return <div className="text-zinc-500 italic text-xs">{ru.bottomPanel.cannotVote}</div>;

  if (hasVoted) return <div className="text-indigo-300 text-xs">{ru.bottomPanel.voteAccepted}</div>;

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
  const handleFinish = async () => {
    const currentVotes = gameState.votes || {};
    const voteCounts: Record<string, number> = {};
    Object.values(currentVotes).forEach((vid) => { voteCounts[vid as string] = (voteCounts[vid as string] || 0) + 1; });
    const bonusByPlayer: Record<string, number> = {};

    const entries = Object.entries(voteCounts);
    if (entries.length > 0) {
      const max = Math.max(...Object.values(voteCounts));
      const winners = entries.filter(([, count]) => count === max).map(([id]) => id);
      const bonus = winners.length === 1 ? 3 : (winners.length === 2 ? 2 : 1);
      winners.forEach((wid) => {
        bonusByPlayer[wid] = bonus;
      });

      const batch = writeBatch(db);
      winners.forEach((wid) => batch.update(doc(db, "players", wid), {
        tiltCoins: increment(bonus),
        bonusPoints: bonus
      }));
      const historyScores = Object.fromEntries(
        players
          .filter((player) => player.role !== "admin")
          .map((player) => {
            const gameScore = gameState.currentResults?.[player.id] ?? player.lastTiltoCoins ?? 0;
            const votingScore = bonusByPlayer[player.id] ?? 0;

            return [
              player.id,
              {
                game: gameScore,
                voting: votingScore,
                total: gameScore + votingScore,
              },
            ];
          }),
      );

      batch.update(doc(db, "gameState", "current"), {
        votes: {},
        gameHistory: arrayUnion({
          id: `${gameState.currentGame || "game"}_${Date.now()}`,
          gameName: gameState.currentGame || "Игра без названия",
          scores: historyScores,
          createdAt: Date.now(),
        }),
      });
      await batch.commit();
    } else {
      const historyScores = Object.fromEntries(
        players
          .filter((player) => player.role !== "admin")
          .map((player) => {
            const gameScore = gameState.currentResults?.[player.id] ?? player.lastTiltoCoins ?? 0;

            return [
              player.id,
              {
                game: gameScore,
                voting: 0,
                total: gameScore,
              },
            ];
          }),
      );

      await updateDoc(doc(db, "gameState", "current"), {
        votes: {},
        gameHistory: arrayUnion({
          id: `${gameState.currentGame || "game"}_${Date.now()}`,
          gameName: gameState.currentGame || "Игра без названия",
          scores: historyScores,
          createdAt: Date.now(),
        }),
      });
    }
    onFinish();
  };

  return (
    <div className="flex gap-4 items-center">
      <div className="text-xs text-indigo-300">{ru.bottomPanel.votedCount(Object.keys(gameState.votes || {}).length)}</div>
      <button onClick={handleFinish} className="bg-green-600 px-4 py-2 rounded-lg text-xs font-black uppercase">{ru.bottomPanel.finish}</button>
    </div>
  );
};

export default BottomPanel;
