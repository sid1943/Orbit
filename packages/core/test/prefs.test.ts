import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, greeting, kindHue, parsePrefs, partOfDay } from "../src/prefs.js";

const at = (h: number) => new Date(2026, 0, 1, h, 30);

describe("partOfDay", () => {
  it("splits the day like Orbit today", () => {
    expect(partOfDay(at(4))).toBe("evening");
    expect(partOfDay(at(5))).toBe("morning");
    expect(partOfDay(at(11))).toBe("morning");
    expect(partOfDay(at(12))).toBe("afternoon");
    expect(partOfDay(at(16))).toBe("afternoon");
    expect(partOfDay(at(17))).toBe("evening");
  });
});

describe("greeting", () => {
  it("adds the name when there is one", () => {
    expect(greeting("Alex", at(9))).toBe("Good morning, Alex");
    expect(greeting("  ", at(20))).toBe("Good evening");
  });
});

describe("parsePrefs", () => {
  it("returns defaults for missing or malformed values", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs({ profile: "x", location: { label: "" } })).toEqual(DEFAULT_PREFS);
  });

  it("reads profile and location", () => {
    expect(parsePrefs({ profile: { name: " Alex " }, location: { label: "Springfield", lat: 1, lng: 2 } })).toEqual({
      profile: { name: "Alex" },
      location: { label: "Springfield", lat: 1, lng: 2 },
    });
  });

  it("drops half-set coordinates", () => {
    expect(parsePrefs({ location: { label: "Springfield", lat: 1 } }).location).toEqual({ label: "Springfield" });
  });
});

describe("kindHue", () => {
  it("knows each kind and falls back for others", () => {
    expect(kindHue("Movie")).toBe(265);
    expect(kindHue("Mystery")).toBe(210);
  });
});
