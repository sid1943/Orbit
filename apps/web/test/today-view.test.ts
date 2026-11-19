import { describe, expect, it } from "vitest";
import { readTodayView, todayViewParams, todayViewPath } from "../src/lib/today-view.js";

describe("Today's view switch", () => {
  it("reads the side from the address", () => {
    expect(readTodayView(new URLSearchParams(""))).toBe("today");
    expect(readTodayView(new URLSearchParams("all=1&status=done"))).toBe("all");
    expect(readTodayView(new URLSearchParams("near=1&within=25"))).toBe("near");
  });
  it("writes a fresh address for each side", () => {
    expect(todayViewParams("today")).toEqual({});
    expect(todayViewParams("all")).toEqual({ all: "1" });
    expect(todayViewParams("near")).toEqual({ near: "1" });
  });
  it("turns old page addresses into Today's sides, keeping filters", () => {
    expect(todayViewPath("near", "?within=25&cat=eatery")).toBe("/?near=1&within=25&cat=eatery");
    expect(todayViewPath("all", "?status=doing")).toBe("/?all=1&status=doing");
    expect(todayViewPath("all", "")).toBe("/?all=1");
  });
});
