import { describe, expect, it } from "vitest";
import {
  REFLECT_CARD_ID,
  calculateJudgeCoinsOutcome,
  calculatePromoAdjustedLoss,
  canOfferReflectResponse,
  isReflectableCard,
} from "../src/components/cardEffectRules";

describe("cardEffectRules", () => {
  it("allows reflect response only for hostile reflectable cards when target has reflect card", () => {
    expect(
      canOfferReflectResponse({
        cardId: "inv_016",
        currentPlayerId: "player-a",
        targetPlayerId: "player-b",
        targetInventory: [REFLECT_CARD_ID],
      }),
    ).toBe(true);

    expect(
      canOfferReflectResponse({
        cardId: "inv_014",
        currentPlayerId: "player-a",
        targetPlayerId: "player-b",
        targetInventory: [REFLECT_CARD_ID],
      }),
    ).toBe(false);

    expect(
      canOfferReflectResponse({
        cardId: "inv_016",
        currentPlayerId: "player-a",
        targetPlayerId: "player-a",
        targetInventory: [REFLECT_CARD_ID],
      }),
    ).toBe(false);

    expect(
      canOfferReflectResponse({
        cardId: "inv_016",
        currentPlayerId: "player-a",
        targetPlayerId: "player-b",
        targetInventory: [],
      }),
    ).toBe(false);
  });

  it("keeps the reflectable card allow-list explicit", () => {
    expect(isReflectableCard("inv_007")).toBe(true);
    expect(isReflectableCard("inv_012")).toBe(true);
    expect(isReflectableCard("inv_020")).toBe(false);
  });

  it("calculates judge coins success and failure outcomes", () => {
    expect(calculateJudgeCoinsOutcome({ roll: 4, cardValue: 2, hasPromoCode: false })).toEqual({
      roll: 4,
      baseDelta: 2,
      delta: 2,
      amount: 2,
      promoCodeReduced: false,
    });

    expect(calculateJudgeCoinsOutcome({ roll: 3, cardValue: 2, hasPromoCode: false })).toEqual({
      roll: 3,
      baseDelta: -2,
      delta: -2,
      amount: 2,
      promoCodeReduced: false,
    });
  });

  it("reduces only negative judge coins outcomes with promo code", () => {
    expect(calculateJudgeCoinsOutcome({ roll: 3, cardValue: 5, hasPromoCode: true })).toEqual({
      roll: 3,
      baseDelta: -5,
      delta: -2,
      amount: 2,
      promoCodeReduced: true,
    });

    expect(calculateJudgeCoinsOutcome({ roll: 5, cardValue: 5, hasPromoCode: true }).promoCodeReduced).toBe(false);
  });

  it("calculates promo-adjusted losses", () => {
    expect(calculatePromoAdjustedLoss({ amount: 10, hasPromoCode: true })).toEqual({
      amount: 5,
      promoCodeReduced: true,
    });

    expect(calculatePromoAdjustedLoss({ amount: 5, hasPromoCode: true })).toEqual({
      amount: 2,
      promoCodeReduced: true,
    });

    expect(calculatePromoAdjustedLoss({ amount: 10, hasPromoCode: false })).toEqual({
      amount: 10,
      promoCodeReduced: false,
    });
  });
});
