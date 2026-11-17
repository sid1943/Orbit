import { describe, expect, it } from "vitest";
import { todaySections } from "../src/lib/today-sections.js";
import { syncItem } from "./helpers/sync-item.js";

// Made-up cards. Tuesday, November 17, 2026.
const NOW = new Date(2026, 10, 17, 12);
const HOME = { lat: 37.3382, lng: -121.8863 };

describe("todaySections", () => {
  const cards = [
    syncItem({ id: "p1", kind: "Place", title: "Close park", lat: 37.35, lng: -121.9 }),
    syncItem({ id: "p2", kind: "Place", title: "Far city", lat: 40.71, lng: -74.0 }),
    syncItem({ id: "p3", kind: "Place", title: "Visited", status: "done", lat: 37.34, lng: -121.89 }),
    syncItem({ id: "e1", kind: "Experience", title: "Lantern fair", props: { "Preferable Time": "December 5" } }),
    syncItem({ id: "e2", kind: "Experience", title: "Leaf walk", props: { "Preferable Time": "Fall" } }),
    syncItem({ id: "d1", status: "doing", title: "Long show", updatedAt: 5 }),
    syncItem({ id: "t1", kind: "To-do", title: "Pay bill", props: { Quest: "Home" }, due: "2026-11-20" }),
    syncItem({ id: "t2", kind: "To-do", title: "Fix shelf", props: { Quest: "Home" } }),
    syncItem({ id: "t3", kind: "To-do", title: "Stretch" }),
    syncItem({ id: "t4", kind: "To-do", title: "Done one", status: "done" }),
    syncItem({ id: "l1", kind: "Book", title: "Reading list", done: 9, total: 10 }),
    syncItem({ id: "x1", title: "Gone", deleted: true, status: "doing" }),
    syncItem({ id: "a1", title: "Archived", archived: true, status: "doing" }),
  ];

  it("lists nearby open places within 100 miles, closest first", () => {
    const s = todaySections(cards, HOME, NOW);
    expect(s.near.map((n) => n.item.id)).toEqual(["p1"]);
    expect(s.placeCount).toBe(3);
    expect(todaySections(cards, null, NOW).near).toEqual([]);
  });

  it("splits dated things into coming up and in season", () => {
    const s = todaySections(cards, HOME, NOW);
    expect(s.comingUp.map((d) => [d.item.id, d.days])).toEqual([["e1", 18]]);
    expect(s.inSeason.map((d) => d.item.id)).toEqual(["e2"]);
  });

  it("groups open to-dos by quest, biggest group first, due dates first", () => {
    const s = todaySections(cards, HOME, NOW);
    expect(s.todoCount).toBe(3);
    expect(s.todos.map((g) => [g.quest, g.items.map((i) => i.id)])).toEqual([
      ["Home", ["t1", "t2"]],
      ["Other", ["t3"]],
    ]);
  });

  it("skips deleted and archived cards", () => {
    const s = todaySections(cards, HOME, NOW);
    expect(s.inProgress.map((i) => i.id)).toEqual(["d1"]);
    expect(s.closest.map((i) => i.id)).toEqual(["l1"]);
    expect(s.recent.some((i) => i.id === "x1" || i.id === "a1")).toBe(false);
  });

  it("picks only tagged things to do, the same all day", () => {
    const pool = Array.from({ length: 20 }, (_, n) => syncItem({ id: `m${n}`, title: `Film ${n}`, tags: ["noir"] }));
    const a = todaySections(pool, null, NOW).picks;
    expect(a).toHaveLength(6);
    expect(todaySections([...pool].reverse(), null, NOW).picks).toEqual(a);
    expect(todaySections([syncItem({ title: "No tags" })], null, NOW).picks).toEqual([]);
  });
});
