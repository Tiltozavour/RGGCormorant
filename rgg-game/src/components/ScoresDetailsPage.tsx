import type { GameHistoryEntry, Player } from "../types/game";
import { isGameParticipant } from "./playerFilters";
import { buildPlayerScoreRows, normalizeScoreParts } from "./scoreUtils";

interface ScoresDetailsPageProps {
  players: Player[];
  totalScores: Record<string, number>;
  gameHistory: GameHistoryEntry[];
  onBack: () => void;
}

function ScoresDetailsPage({
  players,
  totalScores,
  gameHistory,
  onBack,
}: ScoresDetailsPageProps) {
  const scoreboardRows = buildPlayerScoreRows(players, totalScores, gameHistory);
  const activePlayers = players.filter(isGameParticipant);

  const sortedScoreboardRows = [...scoreboardRows]
    .filter((row) => {
      const player = players.find((p) => p.id === row.playerId);
      return Boolean(player && isGameParticipant(player));
    })
    .sort((a, b) => {
      const scoreA = players.find((p) => p.id === a.playerId)?.tiltCoins ?? 0;
      const scoreB = players.find((p) => p.id === b.playerId)?.tiltCoins ?? 0;
      return scoreB - scoreA;
    });

  return (
    <div className="min-h-screen bg-transparent text-white">
      <div className="fixed inset-0 bg-gradient-to-b from-black via-black/70 to-black -z-10" />

      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl text-yellow-300">Подробная статистика</h1>
            <p className="mt-2 text-sm text-zinc-400" style={{ fontFamily: "'Comfortaa', sans-serif" }}>
              Таблицы по всем играм и актуальная сводка по игрокам
            </p>
          </div>

          <button
            onClick={onBack}
            className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-200 transition hover:bg-yellow-500/20"
            style={{ fontFamily: "'Comfortaa', sans-serif" }}
          >
            Назад
          </button>
        </div>

        <section
          className="mb-8 rounded-2xl border border-yellow-500/15 bg-black/40 p-4 backdrop-blur-md"
          style={{ fontFamily: "'Comfortaa', sans-serif" }}
        >
          <h2 className="mb-4 text-lg text-yellow-200">Общий рейтинг</h2>

          <div className="overflow-auto rounded-xl border border-yellow-500/10">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-yellow-500/10 text-yellow-100">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Игрок</th>
                  <th className="px-4 py-3 text-left font-medium">
                    Последний счет
                  </th>
                  <th className="px-4 py-3 text-left font-medium">Бонусы</th>
                  <th className="px-4 py-3 text-left font-medium">
                    Итоговый счет
                  </th>
                </tr>
              </thead>

              <tbody>
                {sortedScoreboardRows.map((row, index) => {
                  const player = players.find((p) => p.id === row.playerId);
                  const rank = index + 1;
                  const isTop1 = rank === 1;
                  const isTop2 = rank === 2;
                  const isTop3 = rank === 3;

                  return (
                    <tr
                      key={row.playerId}
                      className={`border-t border-yellow-500/10 group transition-colors ${
                        isTop1 ? "bg-yellow-500/10" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="w-6 text-center">
                            {isTop1 ? "🥇" : isTop2 ? "🥈" : isTop3 ? "🥉" : <span className="text-xs text-zinc-500">{rank}.</span>}
                          </span>
                          <span className={`font-bold transition-all duration-300 ${
                            isTop1
                              ? "text-yellow-400 group-hover:drop-shadow-[0_0_12px_rgba(250,195,25,0.8)] group-hover:scale-105"
                              : isTop2 ? "text-zinc-200" : isTop3 ? "text-amber-600" : "text-zinc-300"
                          }`}>
                            {row.login}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-300">
                        {player?.lastTiltoCoins ?? 0}
                        {row.lastGameName ? ` (${row.lastGameName})` : ""}
                      </td>
                      <td className="px-4 py-3 text-indigo-300 font-medium">
                        +{player?.bonusPoints ?? 0}
                      </td>
                      <td className="px-4 py-3 text-green-300">
                        {player?.tiltCoins ?? 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-6" style={{ fontFamily: "'Comfortaa', sans-serif" }}>
          {gameHistory.length === 0 && (
            <div className="rounded-2xl border border-yellow-500/15 bg-black/40 p-5 text-zinc-300 backdrop-blur-md">
              История игр пока пуста. Как только в `gameHistory` появятся записи,
              здесь автоматически появятся таблицы по каждой игре.
            </div>
          )}

          {[...gameHistory].reverse().map((game) => {
            const gameRows = activePlayers
              .map((player) => {
                const parts = normalizeScoreParts(game.scores[player.id]);
                const score = parts.game ?? parts.total;
                const bonus = parts.voting ?? Math.max(0, parts.total - score);

                return {
                  player,
                  score,
                  bonus,
                  total: parts.total,
                };
              })
              .sort((left, right) => {
                if (right.total !== left.total) {
                  return right.total - left.total;
                }

                return left.player.login.localeCompare(right.player.login, "ru");
              });

            return (
              <div
                key={game.id}
                className="rounded-2xl border border-yellow-500/15 bg-black/40 p-4 backdrop-blur-md"
              >
                <h2 className="mb-4 text-lg text-yellow-200">{game.gameName}</h2>

                <div className="overflow-auto rounded-xl border border-yellow-500/10">
                  <table className="w-full min-w-[620px] text-sm">
                    <thead className="bg-yellow-500/10 text-yellow-100">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Игрок</th>
                        <th className="px-4 py-3 text-left font-medium">Счет</th>
                        <th className="px-4 py-3 text-left font-medium">Бонусы</th>
                        <th className="px-4 py-3 text-left font-medium">Место</th>
                      </tr>
                    </thead>

                    <tbody>
                      {gameRows.map((row, index) => {
                        const rank = index + 1;
                        const isTop1 = rank === 1;
                        const isTop2 = rank === 2;
                        const isTop3 = rank === 3;

                        return (
                          <tr
                            key={row.player.id}
                            className={`border-t border-yellow-500/10 transition-colors ${
                              isTop1 ? "bg-yellow-500/10" : ""
                            }`}
                          >
                            <td className="px-4 py-3">
                              <span className={`font-bold ${
                                isTop1
                                  ? "text-yellow-400"
                                  : isTop2
                                    ? "text-zinc-200"
                                    : isTop3
                                      ? "text-amber-600"
                                      : "text-zinc-300"
                              }`}>
                                {row.player.login}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-zinc-300">
                              {row.score}
                            </td>
                            <td className="px-4 py-3 text-indigo-300 font-medium">
                              +{row.bonus}
                            </td>
                            <td className="px-4 py-3 text-green-300">
                              {isTop1 ? "🥇" : isTop2 ? "🥈" : isTop3 ? "🥉" : `${rank}.`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}

export default ScoresDetailsPage;
