import { describe, expect, it } from "vitest";
import {
  byStatusThenRecent,
  closestToFinished,
  dailyPick,
  daysUntil,
  distanceMiles,
  formatMiles,
  inSeason,
  inSeasonOnly,
  monthsOf,
  nextStatus,
  parseTodo,
  nextDate,
  relativeDays,
  timeInfo,
  topicCounts,
} from "../src/index.js";

// Tuesday, November 17, 2026 (local time).
const NOW = new Date(2026, 10, 17, 12);
const ymd = (d: Date | null) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : null;

describe("monthsOf", () => {
  it("reads ranges, seasons and holidays", () => {
    expect([...monthsOf("May - July")].sort((a, b) => a - b)).toEqual([4, 5, 6]);
    expect([...monthsOf("November through February")].sort((a, b) => a - b)).toEqual([0, 1, 10, 11]);
    expect([...monthsOf("Fall")].sort((a, b) => a - b)).toEqual([8, 9, 10]);
    expect(monthsOf("Thanksgiving").has(10)).toBe(true);
    expect(monthsOf("year-round").size).toBe(12);
    expect(monthsOf("whenever").size).toBe(0);
  });
});

describe("nextDate", () => {
  it("finds fixed dates and nth weekdays, rolling into next year", () => {
    expect(ymd(nextDate("December 5", NOW))).toBe("2026-12-05");
    expect(ymd(nextDate("July 4", NOW))).toBe("2027-07-04");
    expect(ymd(nextDate("First Saturday in May", NOW))).toBe("2027-05-01");
    expect(ymd(nextDate("Saturday after Thanksgiving", NOW))).toBe("2026-11-28");
    expect(ymd(nextDate("17 November", NOW))).toBe("2026-11-17");
    expect(nextDate("Fall", NOW)).toBeNull();
  });
});

describe("timeInfo and inSeason", () => {
  it("uses the Preferable Time detail", () => {
    expect(timeInfo({ props: {} }, NOW)).toBeNull();
    expect(timeInfo({ props: { "Preferable Time": "Changes" } }, NOW)).toBeNull();
    const ti = timeInfo({ props: { "Preferable Time": "Fall" } }, NOW);
    expect(ti?.text).toBe("Fall");
    expect(inSeason(ti, NOW)).toBe(true);
    expect(inSeason(timeInfo({ props: { "Preferable Time": "Summer" } }, NOW), NOW)).toBe(false);
    expect(inSeason(timeInfo({ props: { "Preferable Time": "Anytime" } }, NOW), NOW)).toBe(false);
  });
  it("leaves cards with an exact day out of In season (they are Coming up)", () => {
    const dated = timeInfo({ props: { "Preferable Time": "Saturday after Thanksgiving" } }, NOW);
    expect(inSeason(dated, NOW)).toBe(true);
    expect(inSeasonOnly(dated, NOW)).toBe(false);
    expect(inSeasonOnly(timeInfo({ props: { "Preferable Time": "Fall" } }, NOW), NOW)).toBe(true);
    expect(inSeasonOnly(timeInfo({ props: { "Preferable Time": "November" } }, NOW), NOW)).toBe(true);
    expect(inSeasonOnly(null, NOW)).toBe(false);
  });
  it("counts days", () => {
    expect(daysUntil(new Date(2026, 10, 18), NOW)).toBe(1);
    expect(relativeDays(0)).toBe("today");
    expect(relativeDays(1)).toBe("tomorrow");
    expect(relativeDays(9)).toBe("in 9 days");
  });
});

describe("byStatusThenRecent", () => {
  it("puts doing first, then newest", () => {
    const a = [
      { title: "B", status: "todo" as const, updatedAt: 1 },
      { title: "A", status: "done" as const, updatedAt: 9 },
      { title: "C", status: "todo" as const, updatedAt: 5 },
      { title: "D", status: "doing" as const, updatedAt: 0 },
    ];
    expect(a.sort(byStatusThenRecent).map((x) => x.title)).toEqual(["D", "C", "B", "A"]);
  });
});

describe("dailyPick", () => {
  it("is stable within a day, different across days, and never repeats", () => {
    const pool = Array.from({ length: 50 }, (_, i) => i);
    const a = dailyPick(pool, 6, NOW);
    expect(a).toEqual(dailyPick(pool, 6, new Date(2026, 10, 17, 23)));
    expect(new Set(a).size).toBe(6);
    expect(a).not.toEqual(dailyPick(pool, 6, new Date(2026, 10, 18)));
    expect(dailyPick([1, 2], 6, NOW)).toHaveLength(2);
  });
});

describe("closestToFinished", () => {
  it("keeps long, unfinished checklists, most done first", () => {
    const r = closestToFinished([
      { id: "a", done: 2, total: 4 },
      { id: "b", done: 9, total: 10 },
      { id: "c", done: 10, total: 10 },
      { id: "d", done: 4, total: 8 },
    ]);
    expect(r.map((x) => x.id)).toEqual(["b", "d"]);
  });
});

describe("topicCounts", () => {
  it("merges case and counts each card once", () => {
    const r = topicCounts([{ tags: ["Hiking", "hiking"] }, { tags: ["hiking", "Coast"] }, { tags: ["Hiking"] }]);
    expect(r[0]).toEqual({ key: "hiking", name: "Hiking", count: 3 });
    expect(r[1]).toEqual({ key: "coast", name: "Coast", count: 1 });
  });
});

describe("distanceMiles", () => {
  it("measures great-circle miles", () => {
    const d = distanceMiles({ lat: 37.3382, lng: -121.8863 }, { lat: 37.7749, lng: -122.4194 });
    expect(d).toBeGreaterThan(41);
    expect(d).toBeLessThan(43);
    expect(formatMiles(0.42)).toBe("0.4 mi");
    expect(formatMiles(1240.2)).toBe("1,240 mi");
  });
});

describe("to-dos and statuses", () => {
  it("reads a quest from #", () => {
    expect(parseTodo("Renew passport #Travel")).toEqual({ title: "Renew passport", quest: "Travel" });
    expect(parseTodo("Call the bank")).toEqual({ title: "Call the bank", quest: "Other" });
    expect(parseTodo("#Only a quest")).toBeNull();
  });
  it("cycles the check box", () => {
    expect(nextStatus("todo")).toBe("doing");
    expect(nextStatus("doing")).toBe("done");
    expect(nextStatus("done")).toBe("todo");
    expect(nextStatus("dropped")).toBe("todo");
  });
});
