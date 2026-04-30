import type { Player, GameHistoryEntry } from "../types/game";
import {
  buildPlayerScoreRows,
} from "./scoreUtils";

interface PlayersSidebarProps {
  isOpen: boolean;
  players: Player[];
  totalScores: Record<string, number>;
  gameHistory: GameHistoryEntry[];
  currentUserId: string | null;
  onClose: () => void;
  onOpenDetails: () => void;
  onOpenCollection: () => void;
}

const FALLBACK_AVATAR =
  "https://i.pinimg.com/736x/6f/8d/ce/6f8dcedfc7102d5e88e0af7b88634fc2.jpg";

function PlayersSidebar({
  isOpen,
  players,
  totalScores,
  gameHistory,
  currentUserId,
  onClose,
  onOpenDetails,
  onOpenCollection,
}: PlayersSidebarProps) {
  void onOpenCollection;
  const rows = buildPlayerScoreRows(players, totalScores, gameHistory);
  const latestGameName = gameHistory.length > 0 ? gameHistory[gameHistory.length - 1].gameName : null;

  // Находим ID текущего лидера (игнорируя админа) для визуального выделения
  const topPlayerId = [...players]
    .filter(p => p.role !== "admin")
    .sort((a, b) => (b.tiltCoins ?? 0) - (a.tiltCoins ?? 0))[0]?.id;

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
                          <div className={`font-bold ${isTop1 ? "text-yellow-400" : "text-white"}`}>{row.login}</div>
                          {isCurrentUser && (
                            <div className="text-[11px] text-yellow-300">
                              это вы
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

                    <td className="px-4 py-3 text-green-300 font-medium">
                      {player?.tiltCoins ?? 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <button
          onClick={onOpenDetails}
          className="self-start text-sm text-yellow-300 underline underline-offset-4 hover:text-yellow-200 active:opacity-50 transition-all font-bold uppercase tracking-widest"
        >
          Подробнее
        </button>
      </aside>
    </>
  );
}

export default PlayersSidebar;
