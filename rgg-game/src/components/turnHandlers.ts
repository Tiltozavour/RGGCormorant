import type { GameState, Player } from "../types/game";
import { isGameParticipant } from "./playerFilters";

export const rollD6 = () => Math.floor(Math.random() * 6) + 1;

const getRoundScore = (player: Player, gameState: GameState) => {
  const resultEntries = Object.entries(gameState.currentResults ?? {});
  const hasCurrentResults = resultEntries.length > 0;

  return hasCurrentResults
    ? Number(gameState.currentResults?.[player.id] ?? 0)
    : Number(player.lastTiltoCoins ?? 0);
};

export const getGoldenCardHolderIds = (
  players: Player[],
  gameState: GameState,
  turnOrder: string[] = [],
) => {
  const candidates = players.filter(isGameParticipant);
  if (candidates.length === 0) return [];

  const zeroScoreIds = candidates
    .filter((player) => getRoundScore(player, gameState) <= 0)
    .map((player) => player.id);

  const lastPositiveId = [...turnOrder].reverse().find((playerId) => {
    const player = candidates.find((candidate) => candidate.id === playerId);
    return Boolean(player && getRoundScore(player, gameState) > 0);
  });

  return Array.from(new Set([
    ...zeroScoreIds,
    ...(lastPositiveId ? [lastPositiveId] : []),
  ]));
};

export const buildTurnState = (players: Player[], gameState: GameState) => {
  const activePlayers = players.filter((player) =>
    isGameParticipant(player) &&
    getRoundScore(player, gameState) > 0
  );
  const previousOrder = new Map(gameState.turnOrder.map((playerId, index) => [playerId, index]));
  const randomTieBreakers = new Map(activePlayers.map((player) => [player.id, Math.random()]));

  const sortedIds = [...activePlayers]
    .sort((a, b) => {
      const scoreA = getRoundScore(a, gameState);
      const scoreB = getRoundScore(b, gameState);
      if (scoreB !== scoreA) return scoreB - scoreA;

      const previousIndexA = previousOrder.get(a.id);
      const previousIndexB = previousOrder.get(b.id);
      if (previousIndexA !== undefined && previousIndexB !== undefined) {
        return previousIndexA - previousIndexB;
      }

      if (previousIndexA !== undefined) return -1;
      if (previousIndexB !== undefined) return 1;

      return (randomTieBreakers.get(a.id) ?? 0) - (randomTieBreakers.get(b.id) ?? 0);
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
