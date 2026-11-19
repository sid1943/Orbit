import { describe, expect, it } from "vitest";
import { bigTopics, layoutStep, topicGraph, topicPage } from "../src/lib/topic-map.js";
import { syncItem } from "./helpers/sync-item.js";

// Made-up cards.
const cards = [
  syncItem({ id: "a", kind: "Place", tags: ["Hiking", "Coast"], status: "done" }),
  syncItem({ id: "b", kind: "Place", tags: ["hiking", "Coast"] }),
  syncItem({ id: "c", kind: "Book", tags: ["Hiking", "Maps"], status: "doing" }),
  syncItem({ id: "d", kind: "Movie", tags: ["Coast"], archived: true }),
  syncItem({ id: "e", kind: "Movie", tags: ["Hiking"], deleted: true }),
];

describe("topicGraph", () => {
  it("sizes topics by live cards, colours by the main kind, and joins topics sharing 2+ cards", () => {
    const g = topicGraph(cards);
    expect(g.nodes.map((n) => [n.key, n.count, n.kind])).toEqual([
      ["hiking", 3, "Place"],
      ["coast", 2, "Place"],
      ["maps", 1, "Book"],
    ]);
    expect(g.edges).toEqual([{ a: 0, b: 1, w: 2 }]);
    expect(topicGraph(cards, 1).nodes).toHaveLength(1);
  });

  it("settles without blowing up", () => {
    const g = topicGraph(cards);
    for (let i = 0; i < 200; i++) layoutStep(g, 1 - i / 200);
    for (const n of g.nodes) {
      expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
      expect(Math.abs(n.x)).toBeLessThan(2000);
    }
  });
});

describe("topicPage", () => {
  it("counts kinds and statuses, lists connected topics and filters the list", () => {
    const p = topicPage(cards, "Hiking", { kind: null, status: "all", showArchived: false });
    expect(p.name).toBe("Hiking");
    expect(p.all.map((c) => c.id).sort()).toEqual(["a", "b", "c"]);
    expect(p.kindCounts).toEqual([
      { kind: "Place", count: 2 },
      { kind: "Book", count: 1 },
    ]);
    expect(p.statusCounts).toEqual([
      { status: "todo", count: 1 },
      { status: "doing", count: 1 },
      { status: "done", count: 1 },
    ]);
    expect(p.connected.map((t) => [t.key, t.count])).toEqual([
      ["coast", 2],
      ["maps", 1],
    ]);
    expect(p.list.map((c) => c.id)).toEqual(["c", "b", "a"]);
    expect(topicPage(cards, "hiking", { kind: "Book", status: "all", showArchived: false }).list).toHaveLength(1);
    expect(topicPage(cards, "nothing", { kind: null, status: "all", showArchived: false }).name).toBeNull();
  });
});

describe("bigTopics", () => {
  it("keeps topics on 6 or more cards", () => {
    const many = Array.from({ length: 6 }, (_, i) => syncItem({ id: `m${i}`, tags: ["Noir"] }));
    expect(bigTopics([...cards, ...many]).map((t) => t.key)).toEqual(["noir"]);
  });
});
