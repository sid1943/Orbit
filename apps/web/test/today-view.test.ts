import { describe, expect, it } from "vitest";
import { readTodayView, todayViewParams, todayViewPath, todayViews } from "../src/lib/today-view.js";

describe("Today's view switch", () => {
  it("reads the side from the address", () => {
    expect(readTodayView(new URLSearchParams(""))).toBe("today");
    expect(readTodayView(new URLSearchParams("all=1&status=done"))).toBe("all");
    expect(readTodayView(new URLSearchParams("near=1&within=25"))).toBe("near");
    expect(readTodayView(new URLSearchParams("map=1"))).toBe("map");
    expect(readTodayView(new URLSearchParams("soon=1"))).toBe("soon");
    expect(readTodayView(new URLSearchParams("season=1"))).toBe("season");
  });
  it("writes a fresh address for each side", () => {
    expect(todayViewParams("today")).toEqual({});
    expect(todayViewParams("all")).toEqual({ all: "1" });
    expect(todayViewParams("near")).toEqual({ near: "1" });
    expect(todayViewParams("map")).toEqual({ map: "1" });
    expect(todayViewParams("soon")).toEqual({ soon: "1" });
  });
  it("turns old page addresses into Today's sides, keeping filters", () => {
    expect(todayViewPath("near", "?within=25&cat=eatery")).toBe("/?near=1&within=25&cat=eatery");
    expect(todayViewPath("all", "?status=doing")).toBe("/?all=1&status=doing");
    expect(todayViewPath("all", "")).toBe("/?all=1");
    expect(todayViewPath("map", "")).toBe("/?map=1");
  });
});

describe("Review on the switch", () => {
  it("shows Review only while guesses are waiting (or while it's open)", () => {
    expect(todayViews(0, "today").map((v) => v.value)).toEqual(["today", "soon", "season", "all", "near", "map"]);
    expect(todayViews(3, "today").at(-1)).toEqual({ value: "review", label: "Review · 3" });
    expect(todayViews(0, "review").at(-1)).toEqual({ value: "review", label: "Review" });
    expect(readTodayView(new URLSearchParams("review=1"))).toBe("review");
    expect(todayViewPath("review", "")).toBe("/?review=1");
  });
});
