import { describe, expect, it } from "vitest";
import type { GameCard } from "../src/types/card";
import { isLegendaryPrizeCard } from "../src/components/legendaryHandlers";

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

describe("legendaryHandlers", () => {
  it("detects legendary rarity, prize action, and legacy leg_ ids", () => {
    expect(isLegendaryPrizeCard(makeCard({ id: "rare", rarity: "legendary" }), "rare")).toBe(true);
    expect(isLegendaryPrizeCard(makeCard({ id: "prize", action: "prize" }), "prize")).toBe(true);
    expect(isLegendaryPrizeCard(undefined, "leg_001")).toBe(true);
    expect(isLegendaryPrizeCard(makeCard({ id: "inv_001" }), "inv_001")).toBe(false);
  });
});
