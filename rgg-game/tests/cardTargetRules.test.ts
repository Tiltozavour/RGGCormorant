import { describe, expect, it } from "vitest";
import { canTargetSelf, cardNeedsTarget, getSelectableCardTargets } from "../src/components/cardTargetRules";
import type { GameCard } from "../src/types/card";
import type { Player } from "../src/types/game";

const card = (overrides: Partial<GameCard>): GameCard => ({
  id: "inv_001",
  name: "",
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

const player = (overrides: Partial<Player> & Pick<Player, "id">): Player => ({
  id: overrides.id,
  login: overrides.id,
  inGame: true,
  role: "player",
  ...overrides,
});

describe("cardTargetRules", () => {
  it("detects cards that need a target", () => {
    expect(cardNeedsTarget(card({ action: "steal_coins" }))).toBe(true);
    expect(cardNeedsTarget(card({ action: "duel" }))).toBe(true);
    expect(cardNeedsTarget(card({ id: "inv_007", action: "move_steps" }))).toBe(true);
    expect(cardNeedsTarget(card({ action: "add_coins", requiresTarget: true }))).toBe(true);
    expect(cardNeedsTarget(card({ action: "add_coins" }))).toBe(false);
  });

  it("allows self target only for inv_007", () => {
    expect(canTargetSelf(card({ id: "inv_007" }))).toBe(true);
    expect(canTargetSelf(card({ id: "inv_016" }))).toBe(false);
  });

  it("filters selectable targets for regular targeted cards", () => {
    const targets = getSelectableCardTargets(
      [
        player({ id: "self" }),
        player({ id: "other" }),
        player({ id: "admin", role: "admin" }),
        player({ id: "out", inGame: false }),
      ],
      "self",
      card({ id: "inv_016" }),
    );

    expect(targets.map((target) => target.id)).toEqual(["other"]);
  });

  it("allows selecting self for inv_007", () => {
    const targets = getSelectableCardTargets(
      [player({ id: "self" }), player({ id: "other" })],
      "self",
      card({ id: "inv_007" }),
    );

    expect(targets.map((target) => target.id)).toEqual(["self", "other"]);
  });
});
