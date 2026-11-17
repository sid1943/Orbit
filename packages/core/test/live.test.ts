import { describe, expect, it } from "vitest";
import { nextCheckAfter } from "../src/index.js";

describe("nextCheckAfter", () => {
  it("checks running shows more often than ended ones", () => {
    expect(nextCheckAfter({ status: "Running", nextEpisode: null })).toBeLessThan(
      nextCheckAfter({ status: "Ended", nextEpisode: null }),
    );
  });

  it("checks daily when an episode is coming", () => {
    expect(nextCheckAfter({ status: "Running", nextEpisode: { date: "2026-12-01" } })).toBe(86_400_000);
  });
});
