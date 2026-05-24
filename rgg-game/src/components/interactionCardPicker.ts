import type { CardRarity, GameCard } from "../types/card";
import { pickRandom, pickWeighted } from "./cardHandlers";

type GamblingRarity = Exclude<CardRarity, "legendary">;
type InteractionCardSource = "gambling" | "bshop";

const GAMBLING_RARITY_WEIGHTS: Array<{ rarity: GamblingRarity; weight: number }> = [
  { rarity: "common", weight: 50 },
  { rarity: "rare", weight: 30 },
  { rarity: "epic", weight: 20 },
];

const GAMBLING_LEGENDARY_CHANCE = 0.1;
const GAMBLING_MOMENTAL_WEIGHT = 3;
const INTERACTION_CARD_COUNT = 3;

export const getRandomInteractionCardIds = (
  type: InteractionCardSource,
  allCards: Record<string, GameCard>,
): string[] => {
  const cardsArray = Object.values(allCards).filter((card): card is GameCard => Boolean(card?.id && card.deck && card.rarity));
  if (cardsArray.length === 0) return [];

  const result: string[] = [];
  const selectedIds = new Set<string>();
  const availableLegendaryCards = cardsArray.filter((card) => card.rarity === "legendary" && !card.isWon);
  const legendarySlot =
    type === "gambling" && availableLegendaryCards.length > 0 && Math.random() < GAMBLING_LEGENDARY_CHANCE
      ? Math.floor(Math.random() * INTERACTION_CARD_COUNT)
      : -1;

  for (let i = 0; i < INTERACTION_CARD_COUNT; i += 1) {
    if (type === "bshop") {
      const pool = cardsArray.filter(
        (card) =>
          card.deck === "inventory" &&
          card.rarity !== "legendary" &&
          typeof card.price === "number" &&
          !selectedIds.has(card.id),
      );
      const selected = pickRandom(pool);
      if (selected) {
        selectedIds.add(selected.id);
        result.push(selected.id);
      }
      continue;
    }

    if (i === legendarySlot) {
      const selected = pickRandom(availableLegendaryCards.filter((card) => !selectedIds.has(card.id)));
      if (selected) {
        selectedIds.add(selected.id);
        result.push(selected.id);
      }
      continue;
    }

    const remainingCards = cardsArray.filter((card) => !selectedIds.has(card.id));
    const rarity = pickWeighted(
      GAMBLING_RARITY_WEIGHTS.filter(({ rarity: weightedRarity }) =>
        remainingCards.some((card) => card.rarity === weightedRarity),
      ),
      ({ weight }) => weight,
    )?.rarity;

    const pool = rarity
      ? remainingCards.filter((card) => card.rarity === rarity)
      : remainingCards.filter((card) => card.rarity !== "legendary");

    const selected = pickWeighted(
      pool,
      (card) => (card.deck === "momental" ? GAMBLING_MOMENTAL_WEIGHT : 1),
    );
    if (selected) {
      selectedIds.add(selected.id);
      result.push(selected.id);
    }
  }

  return result;
};
