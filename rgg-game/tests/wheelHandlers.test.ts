import { afterEach, describe, expect, it, vi } from "vitest";
import { buildWheelSpinPayload } from "../src/components/wheelHandlers";

describe("wheelHandlers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a deterministic wheel spin payload from current rotation and random index", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.25);
    vi.spyOn(Date, "now").mockReturnValue(12345);

    const payload = buildWheelSpinPayload(4, 90, 1, "inv_017", "player-1");

    expect(payload).toEqual({
      isSpinning: true,
      targetRotation: 1935,
      winnerIndex: 1,
      previousWinnerIndex: 1,
      previousTargetRotation: 90,
      lastSpinSource: "inv_017",
      rerollBy: "player-1",
      updatedAt: 12345,
    });
  });
});
