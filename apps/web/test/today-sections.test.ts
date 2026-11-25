import { describe, expect, it } from "vitest";
import { todaySections } from "../src/lib/today-sections.js";
import { syncItem } from "./helpers/sync-item.js";

// Made-up cards. Tuesday, November 17, 2026.
const NOW = new Date(2026, 10, 17, 12);

describe("todaySections", () => {
  const cards = [
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

  it("lists every dated thing in Coming up and every seasonal one in In season", () => {
    const s = todaySections(cards, NOW);
    expect(s.comingUp.map((d) => [d.item.id, d.days])).toEqual([["e1", 18]]);
    expect(s.inSeason.map((d) => d.item.id)).toEqual(["e2"]);
    const far = todaySections(
      [syncItem({ id: "f1", kind: "Experience", title: "Spring fair", props: { "Preferable Time": "May 2" } })],
      NOW,
    );
    expect(far.comingUp.map((d) => d.item.id)).toEqual(["f1"]);
  });

  it("groups open to-dos by quest, biggest group first, due dates first", () => {
    const s = todaySections(cards, NOW);
    expect(s.todoCount).toBe(3);
    expect(s.todos.map((g) => [g.quest, g.items.map((i) => i.id)])).toEqual([
      ["Home", ["t1", "t2"]],
      ["Other", ["t3"]],
    ]);
  });

  it("skips deleted and archived cards", () => {
    const s = todaySections(cards, NOW);
    expect(s.inProgress.map((i) => i.id)).toEqual(["d1"]);
    expect(s.closest.map((i) => i.id)).toEqual(["l1"]);
    expect(s.recent.some((i) => i.id === "x1" || i.id === "a1")).toBe(false);
  });

  it("picks only tagged things to do, the same all day", () => {
    const pool = Array.from({ length: 20 }, (_, n) => syncItem({ id: `m${n}`, title: `Film ${n}`, tags: ["noir"] }));
    const a = todaySections(pool, NOW).picks;
    expect(a).toHaveLength(6);
    expect(todaySections([...pool].reverse(), NOW).picks).toEqual(a);
    expect(todaySections([syncItem({ title: "No tags" })], NOW).picks).toEqual([]);
  });
});
