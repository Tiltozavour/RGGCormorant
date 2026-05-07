import type { Player } from "../types/game";
import { gameMap } from "./gameMap";

export const pickRandom = <T,>(items: T[]): T | null => {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
};

export const pickWeighted = <T,>(items: T[], getWeight: (item: T) => number): T | null => {
  const weightedItems = items
    .map((item) => ({ item, weight: Math.max(0, getWeight(item)) }))
    .filter(({ weight }) => weight > 0);

  const totalWeight = weightedItems.reduce((sum, { weight }) => sum + weight, 0);
  if (totalWeight <= 0) return null;

  let roll = Math.random() * totalWeight;
  for (const { item, weight } of weightedItems) {
    roll -= weight;
    if (roll <= 0) return item;
  }

  return weightedItems[weightedItems.length - 1]?.item ?? null;
};

export const shuffle = <T,>(array: T[]): T[] => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
};

export const addOneCardToInventory = (inventory: string[] | undefined, cardId: string) => [
  ...(inventory ?? []),
  cardId,
];

export const removeOneCardFromInventory = (inventory: string[] | undefined, cardId: string) => {
  const nextInventory = [...(inventory ?? [])];
  const cardIndex = nextInventory.indexOf(cardId);
  if (cardIndex >= 0) nextInventory.splice(cardIndex, 1);
  return nextInventory;
};

export const makeHotCoinGain = (playerId: string, amount: number, sourceCardId?: string, sourceName?: string) =>
  amount > 0
    ? {
        playerId,
        amount,
        sourceCardId,
        sourceName,
        timestamp: Date.now(),
      }
    : null;

export const isPlayerNearby = (
  player1Id: string,
  player2Id: string,
  allPlayers: Player[],
  map: typeof gameMap
): boolean => {
  const player1 = allPlayers.find(p => p.id === player1Id);
  const player2 = allPlayers.find(p => p.id === player2Id);

  if (!player1 || !player2 || player1.position === undefined || player2.position === undefined) {
    return false;
  }

  const pos1 = player1.position;
  const pos2 = player2.position;

  const cell1 = map.find(c => c.id === pos1);
  const cell2 = map.find(c => c.id === pos2);

  if (!cell1 || !cell2) return false;

  return pos1 === pos2 || cell1.next.includes(pos2) || cell2.next.includes(pos1);
};
