import { describe, expect, it } from "vitest";
import type { Player } from "../src/types/game";
import {
  buildNextTaxInteraction,
  getTaxResponseCardIds,
} from "../src/components/taxHandlers";

const makePlayer = (id: string, inventory: string[] = []): Player => ({
  id,
  login: id,
  inventory,
});

describe("taxHandlers", () => {
  it("offers only tax response cards present in player inventory", () => {
    expect(getTaxResponseCardIds(makePlayer("target", ["inv_012", "inv_019", "inv_001"]))).toEqual([
      "inv_012",
      "inv_019",
    ]);
  });

  it("builds next tax interaction from queue and carries tax bank state", () => {
    const interaction = buildNextTaxInteraction({
      queue: ["player-2", "player-3"],
      collectorId: "collector",
      collectorName: "Collector",
      bank: 4,
      ownerId: "owner",
      ownerName: "Owner",
      taxCardId: "inv_015",
      getPlayerById: (playerId) => playerId === "player-2"
        ? makePlayer("player-2", ["inv_006"])
        : null,
    });

    expect(interaction).toEqual({
      playerId: "player-2",
      type: "tax_response",
      targetPlayerId: "owner",
      taxOwnerId: "owner",
      taxOwnerName: "Owner",
      taxCollectorId: "collector",
      taxCollectorName: "Collector",
      taxBank: 4,
      taxQueue: ["player-3"],
      cards: ["inv_006"],
      actingCardId: "inv_015",
    });
  });

  it("returns null when tax queue is empty", () => {
    expect(buildNextTaxInteraction({
      queue: [],
      collectorId: "collector",
      collectorName: "Collector",
      bank: 0,
      ownerId: "owner",
      taxCardId: "inv_015",
      getPlayerById: () => null,
    })).toBeNull();
  });
});
