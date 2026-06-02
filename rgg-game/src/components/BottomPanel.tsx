import React, { useState } from "react";
import type { GameCard } from "../types/card";
import type { GameState, Player } from "../types/game";
import type { User } from "firebase/auth";
import { arrayUnion, doc, updateDoc, increment, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { PHASE_LABELS, getPublicAssetUrl } from "./gameConstants";
import { isGameParticipant } from "./playerFilters";
import { calculatePlacementScore } from "./scoreUtils";
import { ru } from "../i18n/ru";

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
  const [resultInputMode, setResultInputMode] = useState<"scores" | "places">("places");
  const [tempScores, setTempScores] = useState<Record<string, number>>({});
  const [tempResultGroups, setTempResultGroups] = useState<Record<string, number>>({});
  const [tempResultPlaces, setTempResultPlaces] = useState<Record<string, number>>({});
  const [tempSkippedResults, setTempSkippedResults] = useState<Record<string, boolean>>({});
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

  const handleSaveResults = async () => {
    if (!isAdmin) return;
    try {
      const participants = players.filter(isGameParticipant).sort((a, b) => a.login.localeCompare(b.login));
      const roundResults = resultInputMode === "places"
        ? buildPlacementResults(participants, tempResultGroups, tempResultPlaces, tempSkippedResults)
        : Object.fromEntries(
            participants.map((player) => [player.id, tempSkippedResults[player.id] ? 0 : (tempScores[player.id] ?? 0)])
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
    if (!isAdmin) return;
    await updateDoc(doc(db, "gameState", "current"), {
      turnOrder: [...gameState.turnOrder, playerId],
    });
  };

  const handleRemoveFromQueue = async (index: number) => {
    if (!isAdmin || gameState.phase !== "turn") return;
    
    const newTurnOrder = [...gameState.turnOrder];
    newTurnOrder.splice(index, 1);
    
    const update: any = { turnOrder: newTurnOrder };
    
    if (gameState.currentTurnIndex !== undefined) {
      if (index < gameState.currentTurnIndex) {
        // Если удалили запись перед текущим игроком, сдвигаем индекс назад, чтобы остаться на том же игроке
        update.currentTurnIndex = Math.max(0, gameState.currentTurnIndex - 1);
      } else if (index === gameState.currentTurnIndex) {
        // Если удаляем текущего игрока, сбрасываем состояние броска
        update.currentRoll = null;
        update.rollConfirmed = false;
        update.rollBonus = 0;
        
        // Если очередь опустела или удалили последнего, завершаем фазу
        if (newTurnOrder.length === 0 || index >= newTurnOrder.length) {
          onNextPhase();
          return;
        }
      }
    }
    await updateDoc(doc(db, "gameState", "current"), update);
  };

  const handleSkipTurn = async () => {
    if (!isAdmin || gameState.phase !== "turn" || gameState.turnOrder.length === 0) return;
    
    const nextIndex = (gameState.currentTurnIndex ?? 0) + 1;
    
    if (nextIndex >= gameState.turnOrder.length) {
      // Если это был последний игрок в очереди, переходим к следующей фазе (колесо)
      onNextPhase();
    } else {
      // Иначе просто переключаем индекс на следующего и сбрасываем состояние кубика
      await updateDoc(doc(db, "gameState", "current"), {
        currentTurnIndex: nextIndex,
        currentRoll: null,
        rollConfirmed: false,
        rollBonus: 0
      });
    }
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
              {gameState.turnOrder.map((pid, idx) => {
                const isCurrent = idx === gameState.currentTurnIndex;
                return (
                  <div key={pid + idx} className="flex items-center gap-1 shrink-0">
                    <div className={`px-3 py-1 rounded-lg border text-sm transition-all ${isCurrent ? "bg-yellow-500/20 border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.2)]" : "bg-zinc-900/60 border-white/5 opacity-50"}`}>
                      {players.find(p => p.id === pid)?.login || "???"}
                    </div>
                    {!isCurrent ? (
                      <button
                        onClick={() => void handleAction(() => handleRemoveFromQueue(idx))}
                        disabled={isPending}
                        className="p-1 bg-zinc-800 hover:bg-red-900/40 text-zinc-500 hover:text-red-400 border border-white/5 rounded transition-colors disabled:opacity-50"
                        title="Удалить ход из очереди"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                      </button>
                    ) : (
                      <button
                        onClick={() => void handleAction(handleSkipTurn)}
                        disabled={isPending}
                        className="p-1 bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-500/30 rounded transition-colors disabled:opacity-50"
                        title="Пропустить ход игрока"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 17 5-5-5-5M13 17l5-5-5-5"/></svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex items-center gap-2 overflow-x-auto">
              <span className="text-[9px] uppercase tracking-widest text-zinc-500">Добавить ход:</span>
              {players
                .filter(isGameParticipant)
                .map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    disabled={isPending}
                    onClick={() => void handleAction(() => handleAddPlayerToTurnQueue(player.id))}
                    className="rounded-md border border-white/10 bg-zinc-900/70 px-2 py-0.5 text-[10px] text-zinc-300 transition hover:border-yellow-400/50 hover:text-yellow-200 shrink-0"
                  >
                    + {player.login}
                  </button>
                ))}
            </div>
          </div>
        )}

        {/* Ввод результатов Админом */}
        {isAdmin && isFillingResults && (
          <div className="flex w-full items-center gap-3 overflow-x-auto">
            <div className="flex shrink-0 rounded-lg border border-white/10 bg-black/50 p-0.5 text-[10px] font-bold uppercase">
              <button
                type="button"
                onClick={() => setResultInputMode("places")}
                className={`rounded-md px-2 py-1 ${resultInputMode === "places" ? "bg-yellow-500 text-black" : "text-zinc-400"}`}
              >
                Места
              </button>
              <button
                type="button"
                onClick={() => setResultInputMode("scores")}
                className={`rounded-md px-2 py-1 ${resultInputMode === "scores" ? "bg-yellow-500 text-black" : "text-zinc-400"}`}
              >
                Очки
              </button>
            </div>

            {resultInputMode === "places" ? (
              players
                .filter(isGameParticipant)
                .sort((a, b) => a.login.localeCompare(b.login))
                .map((p) => {
                const group = tempResultGroups[p.id] ?? 1;
                const place = tempResultPlaces[p.id] ?? 1;
                const isSkipped = tempSkippedResults[p.id] === true;
                const groupSize = players
                  .filter(isGameParticipant)
                  .filter((player) => tempSkippedResults[player.id] !== true)
                  .filter((player) => (tempResultGroups[player.id] ?? 1) === group).length;
                const previewScore = isSkipped ? 0 : calculatePlacementScore(groupSize, place);

                return (
                  <div key={p.id} className={`flex min-w-[8.5rem] flex-col gap-1 rounded-lg border px-2 py-1 ${isSkipped ? "border-zinc-700 bg-zinc-950/40 opacity-70" : "border-white/10 bg-zinc-950/70"}`}>
                    <span className="truncate text-[10px] text-zinc-300">{p.login}</span>
                    <div className="flex items-center gap-1">
                      <label className="text-[9px] uppercase text-zinc-500">Гр.</label>
                      <input
                        type="number"
                        min={1}
                        disabled={isSkipped}
                        className="w-10 rounded border border-zinc-700 bg-black text-center text-xs text-yellow-400"
                        value={group}
                        onChange={(e) => setTempResultGroups((prev) => ({ ...prev, [p.id]: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                      />
                      <label className="text-[9px] uppercase text-zinc-500">М.</label>
                      <input
                        type="number"
                        min={1}
                        disabled={isSkipped}
                        className="w-10 rounded border border-zinc-700 bg-black text-center text-xs text-yellow-400"
                        value={place}
                        onChange={(e) => setTempResultPlaces((prev) => ({ ...prev, [p.id]: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] text-zinc-500">{previewScore} очк.</span>
                      <button
                        type="button"
                        onClick={() => setTempSkippedResults((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                        className={`rounded px-1.5 py-0.5 text-[8px] font-bold uppercase transition ${isSkipped ? "bg-zinc-600 text-white" : "bg-white/5 text-zinc-500 hover:text-zinc-200"}`}
                      >
                        Не играл
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              players
                .filter(isGameParticipant)
                .sort((a, b) => a.login.localeCompare(b.login))
                .map(p => (
                <div key={p.id} className={`flex flex-col items-center gap-1 ${tempSkippedResults[p.id] ? "opacity-60" : ""}`}>
                  <span className="text-[10px] text-zinc-500">{p.login}</span>
                  <input
                    type="number"
                    disabled={tempSkippedResults[p.id] === true}
                    className="w-12 bg-black border border-zinc-700 rounded text-center text-xs text-yellow-400"
                    value={tempSkippedResults[p.id] ? 0 : (tempScores[p.id] ?? 0)}
                    onChange={(e) => setTempScores(prev => ({ ...prev, [p.id]: parseFloat(e.target.value) || 0 }))}
                  />
                  <button
                    type="button"
                    onClick={() => setTempSkippedResults((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                    className={`rounded px-1.5 py-0.5 text-[8px] font-bold uppercase transition ${tempSkippedResults[p.id] ? "bg-zinc-600 text-white" : "bg-white/5 text-zinc-500 hover:text-zinc-200"}`}
                  >
                    Не играл
                  </button>
                </div>
              ))
            )}
            <button onClick={handleSaveResults} className="shrink-0 bg-green-600 px-4 py-2 rounded-xl text-xs font-bold">{ru.bottomPanel.save}</button>
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
                    backgroundImage: `url("${getPublicAssetUrl(firstCardId ? allCards[firstCardId]?.faceCard : '')}"), linear-gradient(165deg, #4b5563 0%, #000 100%)`,
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
    </div>
  );
};

const buildPlacementResults = (
  participants: Player[],
  groups: Record<string, number>,
  places: Record<string, number>,
  skipped: Record<string, boolean> = {},
): Record<string, number> => {
  const activeParticipants = participants.filter((player) => skipped[player.id] !== true);
  const groupSizes = activeParticipants.reduce<Record<number, number>>((acc, player) => {
    const group = groups[player.id] ?? 1;
    acc[group] = (acc[group] ?? 0) + 1;
    return acc;
  }, {});

  return Object.fromEntries(
    participants.map((player) => {
      if (skipped[player.id]) return [player.id, 0];

      const group = groups[player.id] ?? 1;
      const place = places[player.id] ?? 1;

      return [player.id, calculatePlacementScore(groupSizes[group] ?? 0, place)];
    })
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
      {players.filter((p) => isGameParticipant(p) && (p.lastTiltoCoins ?? 0) > 0).map(p => (
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
    const participants = players.filter(isGameParticipant).sort((a, b) => a.login.localeCompare(b.login));

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
        participants
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
      const roundTotals = Object.fromEntries(
        participants.map((player) => {
          const gameScore = gameState.currentResults?.[player.id] ?? player.lastTiltoCoins ?? 0;
          const votingScore = bonusByPlayer[player.id] ?? 0;
          return [player.id, gameScore + votingScore];
        }),
      );

      batch.update(doc(db, "gameState", "current"), {
        currentResults: roundTotals,
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
      const roundTotals = Object.fromEntries(
        participants.map((player) => {
          const gameScore = gameState.currentResults?.[player.id] ?? player.lastTiltoCoins ?? 0;
          return [player.id, gameScore];
        }),
      );
      const historyScores = Object.fromEntries(
        participants
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
        currentResults: roundTotals,
        votes: {},
        gameHistory: arrayUnion({
          id: `${gameState.currentGame || "game"}_${Date.now()}`,
          gameName: gameState.currentGame || "Игра без названия",
          scores: historyScores,
          createdAt: Date.now(),
        }),
      });
    }
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    onFinish();
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex items-center justify-between">
        <div className="text-xs text-indigo-300">{ru.bottomPanel.votedCount(Object.keys(gameState.votes || {}).length)}</div>
        <button onClick={handleFinish} className="bg-green-600 px-4 py-2 rounded-lg text-xs font-black uppercase">{ru.bottomPanel.finish}</button>
      </div>
      
      <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
        {players
          .filter(isGameParticipant)
          .sort((a, b) => a.login.localeCompare(b.login))
          .map((player) => {
            const hasVoted = !!gameState.votes?.[player.id];
            return (
              <div
                key={player.id}
                className={`px-3 py-1 rounded-lg text-xs border ${
                  hasVoted
                    ? "bg-indigo-500/20 border-indigo-500 text-indigo-300"
                    : "bg-zinc-800/50 border-zinc-700 text-zinc-500"
                }`}
              >
                {player.login}
                <span className="ml-2 text-white/50">
                  {hasVoted ? "✅" : "⏳"}
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
};

export default BottomPanel;
