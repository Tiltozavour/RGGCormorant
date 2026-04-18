import type { GameHistoryEntry, Player } from "../types/game";
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

  return (
    <div className="min-h-screen bg-transparent text-white">
      <div className="fixed inset-0 bg-gradient-to-b from-black via-black/70 to-black -z-10" />

      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl text-yellow-300">Подробная статистика</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Таблицы по всем играм и актуальная сводка по игрокам
            </p>
          </div>

          <button
            onClick={onBack}
            className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-200 transition hover:bg-yellow-500/20"
          >
            Назад
          </button>
        </div>

        <section className="mb-8 rounded-2xl border border-yellow-500/15 bg-black/40 p-4 backdrop-blur-md">
          <h2 className="mb-4 text-lg text-yellow-200">Общий рейтинг</h2>

          <div className="overflow-auto rounded-xl border border-yellow-500/10">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-yellow-500/10 text-yellow-100">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Игрок</th>
                  <th className="px-4 py-3 text-left font-medium">
                    Последний счет
                  </th>
                  <th className="px-4 py-3 text-left font-medium">
                    Итоговый счет
                  </th>
                </tr>
              </thead>

              <tbody>
                {scoreboardRows.map((row) => (
                  <tr
                    key={row.playerId}
                    className="border-t border-yellow-500/10"
                  >
                    <td className="px-4 py-3">{row.login}</td>
                    <td className="px-4 py-3 text-zinc-300">
                      {row.lastTotal}
                      {row.lastGameName ? ` (${row.lastGameName})` : ""}
                    </td>
                    <td className="px-4 py-3 text-green-300">
                      {row.totalScore}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-6">
          {gameHistory.length === 0 && (
            <div className="rounded-2xl border border-yellow-500/15 bg-black/40 p-5 text-zinc-300 backdrop-blur-md">
              История игр пока пуста. Как только в `gameHistory` появятся записи,
              здесь автоматически появятся таблицы по каждой игре.
            </div>
          )}

          {[...gameHistory].reverse().map((game) => (
            <div
              key={game.id}
              className="rounded-2xl border border-yellow-500/15 bg-black/40 p-4 backdrop-blur-md"
            >
              <h2 className="mb-4 text-lg text-yellow-200">{game.gameName}</h2>

              <div className="overflow-auto rounded-xl border border-yellow-500/10">
                <table className="w-full min-w-[620px] text-sm">
                  <thead className="bg-yellow-500/10 text-yellow-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">
                        Игрок
                      </th>
                      <th className="px-4 py-3 text-left font-medium">
                        За игру
                      </th>
                      <th className="px-4 py-3 text-left font-medium">
                        За голосование
                      </th>
                      <th className="px-4 py-3 text-left font-medium">
                        Всего за игру
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {players
                      .filter((player) => player.role !== "admin")
                      .map((player) => {
                        const parts = normalizeScoreParts(game.scores[player.id]);

                        return (
                          <tr
                            key={player.id}
                            className="border-t border-yellow-500/10"
                          >
                            <td className="px-4 py-3">{player.login}</td>
                            <td className="px-4 py-3 text-zinc-300">
                              {parts.game ?? parts.total}
                            </td>
                            <td className="px-4 py-3 text-zinc-300">
                              {parts.voting ?? 0}
                            </td>
                            <td className="px-4 py-3 text-green-300">
                              {parts.total}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

export default ScoresDetailsPage;
