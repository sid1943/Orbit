import { describe, expect, it } from "vitest";
import { nextTrail } from "../src/lib/card-trail.js";

describe("nextTrail", () => {
  it("grows card by card, pops on the way back, and empties on a page", () => {
    let t = nextTrail([], "a");
    expect(t).toEqual(["a"]);
    t = nextTrail(t, "b");
    t = nextTrail(t, "c");
    expect(t).toEqual(["a", "b", "c"]);
    expect(nextTrail(t, "c")).toEqual(["a", "b", "c"]);
    t = nextTrail(t, "b");
    expect(t).toEqual(["a", "b"]);
    expect(nextTrail(t, null)).toEqual([]);
  });
});
