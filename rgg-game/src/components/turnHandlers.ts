import type { GameState, Player } from "../types/game";

export const rollD6 = () => Math.floor(Math.random() * 6) + 1;

export const getGoldenCardHolderIds = (players: Player[], gameState: GameState) => {
  const candidates = players.filter((player) => player.role !== "admin");
  if (candidates.length === 0) return [];

  const resultEntries = Object.entries(gameState.currentResults ?? {});
  const hasCurrentResults = resultEntries.length > 0;
  const getScore = (player: Player) => hasCurrentResults
    ? Number(gameState.currentResults?.[player.id] ?? 0)
    : Number(player.lastTiltoCoins ?? 0);

  const zeroScoreIds = candidates
    .filter((player) => getScore(player) <= 0)
    .map((player) => player.id);

  const bottomPositiveScores = Array.from(
    new Set(candidates.map(getScore).filter((score) => score > 0))
  )
    .sort((a, b) => a - b)
    .slice(0, 3);

  const bottomNonZeroIds = candidates
    .filter((player) => bottomPositiveScores.includes(getScore(player)))
    .map((player) => player.id);

  return Array.from(new Set([...zeroScoreIds, ...bottomNonZeroIds]));
};

export const buildTurnState = (players: Player[], gameState: GameState) => {
  const resultEntries = Object.entries(gameState.currentResults ?? {});
  const hasCurrentResults = resultEntries.length > 0;
  const getRoundScore = (player: Player) =>
    hasCurrentResults
      ? Number(gameState.currentResults?.[player.id] ?? 0)
      : Number(player.lastTiltoCoins ?? 0);

  const activePlayers = players.filter((player) =>
    player.inGame &&
    player.role !== "admin" &&
    getRoundScore(player) > 0
  );
  const sortedIds = [...activePlayers]
    .sort((a, b) => {
      const scoreA = getRoundScore(a);
      const scoreB = getRoundScore(b);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return gameState.turnOrder.indexOf(a.id) - gameState.turnOrder.indexOf(b.id);
    })
    .map((player) => player.id);

  return {
    turnOrder: sortedIds,
    currentTurnIndex: 0,
    currentRoll: null,
    currentRollPlayerId: null,
    lastBaseRoll: null,
    rollBonus: 0,
    rollConfirmed: false,
    forcedMovePlayerId: null,
    hotCoinGain: null,
  };
};
