import { useState } from "react";
import type { DuelState, GameState, Player, GameHistoryEntry } from "../types/game";
import {
  buildPlayerScoreRows,
} from "./scoreUtils";
import type { GameCard } from "../types/card";
import AdminDialog from "./AdminDialog";
import { ru } from "../i18n/ru";
import { FALLBACK_AVATAR } from "./gameConstants";

interface PlayersSidebarProps {
  isOpen: boolean;
  players: Player[];
  totalScores: Record<string, number>;
  gameState: GameState; // Добавляем gameState
  allCards: Record<string, GameCard>;
  isAdmin: boolean;
  onUpdateCoins: (targetId: string, amount: number) => Promise<void>;
  onAddCard: (targetId: string, cardId: string) => Promise<void>;
  onRemoveCard: (targetId: string, cardId: string) => Promise<void>;
  gameHistory: GameHistoryEntry[];
  currentUserId: string | null;
  onClose: () => void;
  onOpenDetails: () => void;
  onOpenCollection: () => void;
}

function PlayersSidebar({
  isOpen,
  players,
  totalScores,
  gameState, // Принимаем gameState
  allCards,
  isAdmin,
  onUpdateCoins,
  onAddCard,
  onRemoveCard,
  gameHistory,
  currentUserId,
  onClose,
  onOpenDetails,
  onOpenCollection,
}: PlayersSidebarProps) {
  void onOpenCollection;
  const [cardDialogPlayerId, setCardDialogPlayerId] = useState<string | null>(null);
  const [coinDialog, setCoinDialog] = useState<{ playerId: string; login: string; value: string } | null>(null);
  const rows = buildPlayerScoreRows(players, totalScores, gameHistory);
  const latestGameName = gameHistory.length > 0 ? gameHistory[gameHistory.length - 1].gameName : null;

  // Находим ID текущего лидера (игнорируя админа) для визуального выделения
  const topPlayerId = [...players]
    .filter(p => p.role !== "admin")
    .sort((a, b) => (b.tiltCoins ?? 0) - (a.tiltCoins ?? 0))[0]?.id;

  const activeDuels = Object.values(gameState.activeDuels || {}).filter(
    (duel) => duel.status !== "finished"
  );


  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-[min(92vw,720px)] bg-black/65 backdrop-blur-xl border-r border-yellow-500/20 p-4 md:p-6 pt-24 flex flex-col gap-4 z-[70] transform transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ fontFamily: "'Comfortaa', sans-serif" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl text-yellow-300">Игроки и очки</h2>
            <p className="text-sm text-zinc-400">
              {latestGameName
                ? `Последняя игра: ${latestGameName}`
                : "История игр пока не заполнена"}
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white hover:scale-110 active:scale-90 transition-all p-1"
          >
            Закрыть
          </button>
        </div>

        <div className="overflow-auto rounded-2xl border border-yellow-500/15 bg-zinc-950/60">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-yellow-500/10 text-yellow-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Игрок</th>
                <th className="px-4 py-3 text-left font-medium">
                  Последний счет
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  Бонусы
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  Итоговый счет
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => {
                const isCurrentUser = row.playerId === currentUserId;
                // Находим игрока, чтобы взять актуальные данные из БД
                const player = players.find(p => p.id === row.playerId);
                const lastScore = player?.lastTiltoCoins ?? 0;
                const bonusScore = player?.bonusPoints ?? 0;
                const gameLabel = row.lastGameName
                  ? ` (${row.lastGameName})`
                  : "";
                const isTop1 = row.playerId === topPlayerId;

                return (
                  <tr
                    key={row.playerId}
                    className={`border-t border-yellow-500/10 transition-all duration-500 ${
                      isTop1 
                        ? "bg-yellow-500/20 shadow-[inset_0_0_30px_rgba(250,204,21,0.1)]" 
                        : isCurrentUser ? "bg-yellow-500/8" : "bg-transparent"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={row.avatar || FALLBACK_AVATAR}
                          className={`h-9 w-9 rounded-full object-cover border-2 ${isTop1 ? "border-yellow-400 shadow-[0_0_10px_rgba(250,195,25,0.4)]" : ""}`}
                          style={{ borderColor: !isTop1 ? (player?.borderColor || "rgba(250,195,25,0.2)") : undefined }}
                        />
                        <div>
                          <div className={`flex items-center gap-1.5 font-bold ${isTop1 ? "text-yellow-400" : "text-white"}`}>
                            <span>{row.login}</span>
                            {(gameState.goldenCardHolderIds ?? []).includes(row.playerId) && (
                              <span
                                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-yellow-300/60 bg-yellow-400/15 px-1 text-[11px] text-yellow-200 shadow-[0_0_12px_rgba(250,204,21,0.25)]"
                                title="Золотая карта: скидка 50% в B-Shop"
                              >
                                ★
                              </span>
                            )}
                          </div>
                          {isCurrentUser && (
                            <div className="text-[11px] text-yellow-300">
                              это вы
                            </div>
                          )}
                          {/* Админ-панель управления инвентарем */}
                          {isAdmin && (
                            <div className="mt-1 flex flex-wrap gap-1 max-w-[240px]">
                              {player?.inventory?.map((cardId, i) => (
                                <div key={i} className="flex items-center bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[9px] group/card">
                                  <span className="text-zinc-400 truncate max-w-[80px]" title={allCards[cardId]?.name || cardId}>
                                    {allCards[cardId]?.name || cardId}
                                  </span>
                                  <button 
                                    onClick={() => void onRemoveCard(row.playerId, cardId)}
                                    className="ml-1 text-red-500 opacity-0 group-hover/card:opacity-100 transition-opacity hover:text-red-400"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                              <button 
                                onClick={() => setCardDialogPlayerId(row.playerId)}
                                className="px-1.5 py-0.5 bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 rounded text-[9px] hover:bg-yellow-500/20 transition-colors"
                              >
                                + Карта
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-zinc-200">
                      {lastScore}
                      <span className="text-zinc-500">{gameLabel}</span>
                    </td>

                    <td className="px-4 py-3 text-indigo-300 font-medium">
                      +{bonusScore}
                    </td>

                    <td className="px-4 py-3 text-green-300 font-medium group">
                      <div className="flex items-center justify-between gap-2">
                        <span>{player?.tiltCoins ?? 0}</span>
                        {isAdmin && (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => void onUpdateCoins(row.playerId, (player?.tiltCoins ?? 0) + 1)}
                              className="w-6 h-6 bg-green-500/20 hover:bg-green-500/40 border border-green-500/30 rounded flex items-center justify-center text-xs text-green-300 transition-colors"
                            >
                              +
                            </button>
                            <button
                              onClick={() => void onUpdateCoins(row.playerId, Math.max(0, (player?.tiltCoins ?? 0) - 1))}
                              className="w-6 h-6 bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 rounded flex items-center justify-center text-xs text-red-300 transition-colors"
                            >
                              -
                            </button>
                            <button
                              onClick={() => setCoinDialog({
                                playerId: row.playerId,
                                login: row.login,
                                value: String(player?.tiltCoins ?? 0),
                              })}
                              className="w-6 h-6 bg-yellow-500/20 hover:bg-yellow-500/40 border border-yellow-500/30 rounded flex items-center justify-center text-[10px] text-yellow-300 transition-colors"
                            >
                              ✎
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Секция активных дуэлей */}
        {activeDuels.length > 0 && (
          <section className="mb-8 rounded-2xl border border-yellow-500/15 bg-zinc-950/60 p-4 backdrop-blur-md">
            <h2 className="mb-4 text-lg text-yellow-200">Активные дуэли</h2>
            <div className="flex flex-col gap-4">
              {activeDuels.map((duel: DuelState) => {
                const challenger = players.find(p => p.id === duel.challengerId);
                const target = players.find(p => p.id === duel.targetId);
                const totalBet = (duel.bets[duel.challengerId] || 0) + (duel.bets[duel.targetId] || 0);

                let statusText = "";
                let actionPlayerId: string | null = null;

                switch (duel.status) {
                  case "pending":
                    statusText = "Ожидает ответа";
                    actionPlayerId = duel.targetId;
                    break;
                  case "accepted":
                    statusText = "Выбор оружия";
                    actionPlayerId = duel.targetId; // Цель выбирает оружие первой
                    break;
                  case "betting":
                    statusText = "Размещение ставок";
                    // Определяем, кто еще не сделал ставку
                    if (!duel.isReady[duel.challengerId]) actionPlayerId = duel.challengerId;
                    else if (!duel.isReady[duel.targetId]) actionPlayerId = duel.targetId;
                    break;
                  case "ready_to_roll":
                    statusText = "Готовность к броску";
                    actionPlayerId = duel.challengerId; // Инициатор бросает кубики
                    break;
                  case "rolling":
                    statusText = "Бросок кубиков";
                    break;
                  case "admin_wait":
                    statusText = "Ожидание решения админа";
                    actionPlayerId = "admin"; // Условно, чтобы показать, что админ должен действовать
                    break;
                  default:
                    statusText = "Неизвестный статус";
                }

                return (
                  <div key={duel.id} className="bg-zinc-800/50 p-3 rounded-xl border border-zinc-700/50">
                    <p className="text-zinc-300 text-sm font-bold">
                      {challenger?.login} <span className="text-zinc-500">vs</span> {target?.login}
                    </p>
                    <p className="text-zinc-400 text-xs mt-1">
                      Статус: <span className="text-yellow-400">{statusText}</span>
                    </p>
                    {duel.weapon && (
                      <p className="text-zinc-400 text-xs">
                        Оружие: <span className="text-blue-400">{duel.weapon === 'dice' ? 'Кубики' : 'Игра по выбору'}</span>
                      </p>
                    )}
                    {totalBet > 0 && (
                      <p className="text-zinc-400 text-xs">
                        Банк: <span className="text-green-400">{totalBet} 🦖</span>
                      </p>
                    )}
                    {actionPlayerId && actionPlayerId !== "admin" && (
                      <p className="text-zinc-400 text-xs">
                        Действует: <span className="text-purple-400">{players.find(p => p.id === actionPlayerId)?.login}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <button
          onClick={onOpenDetails}
          className="self-start text-sm text-yellow-300 underline underline-offset-4 hover:text-yellow-200 active:opacity-50 transition-all font-bold uppercase tracking-widest"
        >
          Подробнее
        </button>
      </aside>
      <AdminDialog
        isOpen={Boolean(cardDialogPlayerId)}
        variant="input"
        title={ru.adminDialog.addCardTitle}
        inputLabel={ru.adminDialog.addCardLabel}
        inputPlaceholder={ru.adminDialog.addCardPlaceholder}
        confirmLabel={ru.adminDialog.addCardConfirm}
        cancelLabel={ru.bottomPanel.cancel}
        onClose={() => setCardDialogPlayerId(null)}
        onConfirm={(value) => {
          const cardId = value?.trim();
          const playerId = cardDialogPlayerId;
          setCardDialogPlayerId(null);
          if (playerId && cardId) void onAddCard(playerId, cardId);
        }}
      />
      <AdminDialog
        isOpen={Boolean(coinDialog)}
        variant="input"
        inputType="number"
        title={ru.adminDialog.setCoinsTitle(coinDialog?.login ?? "")}
        inputLabel={ru.adminDialog.setCoinsLabel}
        initialValue={coinDialog?.value ?? "0"}
        confirmLabel={ru.adminDialog.setCoinsConfirm}
        cancelLabel={ru.bottomPanel.cancel}
        onClose={() => setCoinDialog(null)}
        onConfirm={(value) => {
          const playerId = coinDialog?.playerId;
          const amount = Number.parseInt(value ?? "", 10);
          setCoinDialog(null);
          if (playerId && !Number.isNaN(amount)) void onUpdateCoins(playerId, amount);
        }}
      />
    </>
  );
}

export default PlayersSidebar;
