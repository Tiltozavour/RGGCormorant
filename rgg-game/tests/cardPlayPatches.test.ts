import { describe, expect, it } from "vitest";
import { buildPlayedCardPatches } from "../src/components/cardPlayPatches";

describe("cardPlayPatches", () => {
  it("removes exactly one copy of the played card and preserves extra patches", () => {
    const patches = buildPlayedCardPatches({
      inventory: ["inv_001", "inv_002", "inv_001"],
      cardId: "inv_001",
      playerPatch: { customStatus: "fish_shield" },
      gameStatePatch: { activeInteraction: null },
    });

    expect(patches.playerPatch.inventory).toEqual(["inv_002", "inv_001"]);
    expect(patches.playerPatch.customStatus).toBe("fish_shield");
    expect(patches.gameStatePatch.activeInteraction).toBe(null);
    expect(patches.gameStatePatch.revealedCards).toBeDefined();
  });

  it("allows effect patches to be committed with the card spend patch", () => {
    const patches = buildPlayedCardPatches({
      inventory: ["inv_001"],
      cardId: "inv_001",
      playerPatch: { hasProtection: true },
      gameStatePatch: { hotCoinGain: null },
    });

    expect(patches.playerPatch).toMatchObject({
      inventory: [],
      hasProtection: true,
    });
    expect(patches.gameStatePatch.hotCoinGain).toBe(null);
  });

  it("keeps inventory unchanged when the card is not present", () => {
    const patches = buildPlayedCardPatches({
      inventory: ["inv_002"],
      cardId: "inv_001",
    });

    expect(patches.playerPatch.inventory).toEqual(["inv_002"]);
  });
});
