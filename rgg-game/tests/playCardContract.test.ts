import { describe, expect, it } from "vitest";
import {
  PLAY_CARD_CONTRACT_VERSION,
  makePlayCardRequest,
  validatePlayCardRequest,
} from "../src/shared/playCardContract";

describe("playCardContract", () => {
  it("accepts a minimal valid request", () => {
    expect(
      validatePlayCardRequest({
        version: PLAY_CARD_CONTRACT_VERSION,
        cardId: "inv_014",
        targetPlayerId: "player-b",
        source: "hand",
        clientRequestId: "request-1",
      }),
    ).toEqual({
      ok: true,
      value: {
        version: PLAY_CARD_CONTRACT_VERSION,
        cardId: "inv_014",
        targetPlayerId: "player-b",
        source: "hand",
        clientRequestId: "request-1",
      },
    });
  });

  it("rejects malformed requests before backend logic runs", () => {
    expect(validatePlayCardRequest(null).ok).toBe(false);
    expect(validatePlayCardRequest({ version: 999, cardId: "inv_014", source: "hand", clientRequestId: "r" }).ok).toBe(false);
    expect(validatePlayCardRequest({ version: 1, cardId: "", source: "hand", clientRequestId: "r" }).ok).toBe(false);
    expect(validatePlayCardRequest({ version: 1, cardId: "inv_014", source: "unknown", clientRequestId: "r" }).ok).toBe(false);
    expect(validatePlayCardRequest({ version: 1, cardId: "inv_014", source: "hand", clientRequestId: "" }).ok).toBe(false);
  });

  it("creates versioned requests for the future callable", () => {
    expect(
      makePlayCardRequest({
        cardId: "inv_006",
        source: "interaction",
        clientRequestId: "request-2",
      }),
    ).toEqual({
      version: PLAY_CARD_CONTRACT_VERSION,
      cardId: "inv_006",
      targetPlayerId: null,
      source: "interaction",
      clientRequestId: "request-2",
    });
  });
});
