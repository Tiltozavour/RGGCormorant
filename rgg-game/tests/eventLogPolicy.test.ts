import { afterEach, describe, expect, it } from "vitest";
import type { GameEvent } from "../src/components/useModalStates";
import {
  resetEventLogPolicyStateForTests,
  shouldPersistGameEvent,
} from "../src/components/eventLogPolicy";

const makeEvent = (overrides: Partial<GameEvent>): GameEvent => ({
  id: "event-1",
  timestamp: 1000,
  type: "card_play",
  message: "event",
  ...overrides,
});

describe("eventLogPolicy", () => {
  afterEach(() => {
    resetEventLogPolicyStateForTests();
  });

  it("skips only service info events unless verbose Firestore logging is enabled", () => {
    const event = makeEvent({ type: "info" });

    expect(shouldPersistGameEvent(event, 1000, false)).toBe(false);
    expect(shouldPersistGameEvent(event, 1000, true)).toBe(true);
    expect(shouldPersistGameEvent(makeEvent({ type: "movement" }), 1001, false)).toBe(true);
    expect(shouldPersistGameEvent(makeEvent({ type: "coin_change" }), 1002, false)).toBe(true);
    expect(shouldPersistGameEvent(makeEvent({ type: "status_effect" }), 1003, false)).toBe(true);
  });

  it("deduplicates the same persisted event for a short window", () => {
    const event = makeEvent({ type: "card_play", message: "same card" });

    expect(shouldPersistGameEvent(event, 1000, false)).toBe(true);
    expect(shouldPersistGameEvent(event, 2000, false)).toBe(false);
    expect(shouldPersistGameEvent(event, 5001, false)).toBe(true);
  });

  it("keeps warning and error events when the per-minute write budget is exhausted", () => {
    for (let i = 0; i < 80; i += 1) {
      expect(shouldPersistGameEvent(makeEvent({ id: `event-${i}`, message: `event-${i}` }), 1000 + i, false)).toBe(true);
    }

    expect(shouldPersistGameEvent(makeEvent({ id: "extra", message: "extra" }), 2000, false)).toBe(false);
    expect(shouldPersistGameEvent(makeEvent({ id: "warning", type: "warning", message: "warning" }), 2000, false)).toBe(true);
    expect(shouldPersistGameEvent(makeEvent({ id: "error", type: "error", message: "error" }), 2000, false)).toBe(true);
  });
});
