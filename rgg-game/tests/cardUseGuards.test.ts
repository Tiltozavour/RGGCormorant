import { describe, expect, it } from "vitest";
import { evaluateCardUseGuard } from "../src/components/cardUseGuards";
import type { CardAction } from "../src/types/card";

const guard = (overrides: Partial<Parameters<typeof evaluateCardUseGuard>[0]> & { action?: CardAction; id?: string } = {}) =>
  evaluateCardUseGuard({
    isAdmin: false,
    card: {
      id: overrides.id ?? "inv_001",
      action: overrides.action ?? "add_coins",
    },
    phase: "turn",
    currentRoll: null,
    currentRollPlayerId: null,
    rollConfirmed: false,
    showWheel: false,
    currentTurnPlayerId: "player-a",
    userId: "player-a",
    hasProtection: false,
    ...overrides,
  });

describe("cardUseGuards", () => {
  it("allows admins to bypass phase and turn restrictions but not passive/response-only cards", () => {
    expect(guard({ isAdmin: true, phase: "playing", currentTurnPlayerId: "other" })).toEqual({ ok: true });
    expect(guard({ isAdmin: true, action: "passive_benefit" })).toEqual({ ok: false, reason: "passive_card" });
    expect(guard({ isAdmin: true, action: "reflect_debuff" })).toEqual({ ok: false, reason: "reflect_response_only" });
  });

  it("allows only wheel reroll or fish cancellation during next_game", () => {
    expect(guard({ phase: "next_game", action: "add_coins" })).toEqual({
      ok: false,
      reason: "only_wheel_card_in_next_game",
    });
    expect(guard({ phase: "next_game", action: "spin_wheel" })).toEqual({ ok: true });
    expect(guard({ phase: "next_game", action: "fish_protection", showWheel: true })).toEqual({ ok: true });
  });

  it("blocks fish protection outside turn and next_game wheel states", () => {
    expect(guard({ phase: "playing", action: "fish_protection" })).toEqual({
      ok: false,
      reason: "cards_blocked_in_phase",
    });
    expect(guard({ phase: "next_game", action: "fish_protection", showWheel: false })).toEqual({
      ok: false,
      reason: "only_wheel_card_in_next_game",
    });
  });

  it("blocks normal cards outside the active player's turn", () => {
    expect(guard({ currentTurnPlayerId: "player-b", action: "add_coins" })).toEqual({
      ok: false,
      reason: "not_current_turn",
    });
    expect(guard({ currentTurnPlayerId: "player-b", action: "protection" })).toEqual({ ok: true });
    expect(guard({ currentTurnPlayerId: "player-b", action: "promo_code_benefit" })).toEqual({ ok: true });
  });

  it("blocks cards that must be played before the roll", () => {
    expect(guard({ id: "inv_005", action: "teleport", currentRoll: 4 })).toEqual({
      ok: false,
      reason: "quantum_after_roll",
    });
    expect(guard({ action: "add_coins", currentRoll: 4 })).toEqual({
      ok: false,
      reason: "regular_after_roll",
    });
  });

  it("keeps movement cards before confirmed movement and extra roll after an existing roll", () => {
    expect(guard({ action: "move_steps", currentRoll: 4, rollConfirmed: false })).toEqual({ ok: true });
    expect(guard({ action: "move_steps", currentRoll: 4, rollConfirmed: true })).toEqual({
      ok: false,
      reason: "movement_already_started",
    });
    expect(guard({ action: "extra_roll", currentRoll: null })).toEqual({
      ok: false,
      reason: "extra_roll_before_roll",
    });
    expect(guard({ action: "extra_roll", currentRoll: 2 })).toEqual({ ok: true });
  });
});
