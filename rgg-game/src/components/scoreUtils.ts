import type { GameHistoryEntry, GameScoreParts, Player } from "../types/game";

export interface PlayerScoreRow {
  playerId: string;
  login: string;
  avatar?: string;
  lastGameName: string | null;
  lastTotal: number;
  lastGamePoints: number | null;
  lastVotingPoints: number | null;
  totalScore: number;
}

const EMPTY_PARTS: GameScoreParts = {
  total: 0,
};

export function normalizeScoreParts(
  value: number | GameScoreParts | undefined
): GameScoreParts {
  if (typeof value === "number") {
    return { total: value };
  }

  if (!value) {
    return EMPTY_PARTS;
  }

  return {
    total: value.total ?? 0,
    game: value.game,
    voting: value.voting,
  };
}

export function formatLastScore(row: PlayerScoreRow): string {
  if (!row.lastGameName) {
    return "-";
  }

  if (row.lastGamePoints === null && row.lastVotingPoints === null) {
    return String(row.lastTotal);
  }

  const gamePoints = row.lastGamePoints ?? 0;
  const votingPoints = row.lastVotingPoints ?? 0;

  return `${row.lastTotal} (${gamePoints}+${votingPoints})`;
}

export function buildPlayerScoreRows(
  players: Player[],
  totalScores: Record<string, number>,
  gameHistory: GameHistoryEntry[]
): PlayerScoreRow[] {
  const latestGame = gameHistory.at(-1) ?? null;

  return [...players]
    .filter((player) => player.role !== "admin")
    .map((player) => {
      const latestScore = normalizeScoreParts(latestGame?.scores[player.id]);

      return {
        playerId: player.id,
        login: player.login,
        avatar: player.avatar,
        lastGameName: latestGame?.gameName ?? null,
        lastTotal: latestScore.total,
        lastGamePoints: latestScore.game ?? null,
        lastVotingPoints: latestScore.voting ?? null,
        totalScore: totalScores[player.id] ?? 0,
      };
    })
    .sort((left, right) => {
      if (right.totalScore !== left.totalScore) {
        return right.totalScore - left.totalScore;
      }

      return left.login.localeCompare(right.login, "ru");
    });
}
