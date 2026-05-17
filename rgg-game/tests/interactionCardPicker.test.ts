import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameCard } from "../src/types/card";
import { getRandomInteractionCardIds } from "../src/components/interactionCardPicker";

const makeCard = ({ id, ...overrides }: Partial<GameCard> & Pick<GameCard, "id">): GameCard => ({
  id,
  name: id,
  description: "",
  deck: "inventory",
  rarity: "common",
  action: "add_coins",
  value: 0,
  faceCard: "",
  price: null,
  number: 1,
  ...overrides,
});

describe("interactionCardPicker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns unique priced inventory cards for b-shop", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const cards = {
      inv_priced_1: makeCard({ id: "inv_priced_1", deck: "inventory", price: 3 }),
      inv_priced_2: makeCard({ id: "inv_priced_2", deck: "inventory", price: 4 }),
      inv_priced_3: makeCard({ id: "inv_priced_3", deck: "inventory", price: 5 }),
      inv_free: makeCard({ id: "inv_free", deck: "inventory", price: null }),
      mom_priced: makeCard({ id: "mom_priced", deck: "momental", price: 3 }),
    };

    expect(getRandomInteractionCardIds("bshop", cards)).toEqual([
      "inv_priced_1",
      "inv_priced_2",
      "inv_priced_3",
    ]);
  });

  it("returns fewer b-shop cards instead of duplicating when the pool is small", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const cards = {
      inv_priced: makeCard({ id: "inv_priced", deck: "inventory", price: 3 }),
      inv_free: makeCard({ id: "inv_free", deck: "inventory", price: null }),
    };

    expect(getRandomInteractionCardIds("bshop", cards)).toEqual(["inv_priced"]);
  });

  it("does not offer legendary cards in b-shop even when they have a price", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const cards = {
      leg_priced: makeCard({ id: "leg_priced", deck: "inventory", rarity: "legendary", price: 1 }),
      inv_priced: makeCard({ id: "inv_priced", deck: "inventory", rarity: "rare", price: 7 }),
    };

    expect(getRandomInteractionCardIds("bshop", cards)).toEqual(["inv_priced"]);
  });

  it("can place one available legendary card in gambling when legendary chance hits", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    const cards = {
      leg_taken: makeCard({ id: "leg_taken", rarity: "legendary", isWon: true }),
      leg_available: makeCard({ id: "leg_available", rarity: "legendary", isWon: false }),
      common_card_1: makeCard({ id: "common_card_1", rarity: "common" }),
      common_card_2: makeCard({ id: "common_card_2", rarity: "common" }),
    };

    const result = getRandomInteractionCardIds("gambling", cards);

    expect(result).toHaveLength(3);
    expect(result[0]).toBe("leg_available");
    expect(result).not.toContain("leg_taken");
  });

  it("does not offer legendary cards in gambling when chance misses", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    const cards = {
      leg_available: makeCard({ id: "leg_available", rarity: "legendary", isWon: false }),
      common_card: makeCard({ id: "common_card", rarity: "common" }),
    };

    expect(getRandomInteractionCardIds("gambling", cards)).toEqual(["common_card"]);
  });
});
