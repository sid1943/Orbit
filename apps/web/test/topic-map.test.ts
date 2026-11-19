import { describe, expect, it } from "vitest";
import {
  bigTopics,
  focusRing,
  graphBounds,
  layoutStep,
  topicGraph,
  topicPage,
  type TopicNode,
} from "../src/lib/topic-map.js";
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

describe("map room", () => {
  it("keeps topics apart by their names' width", () => {
    const g = topicGraph([
      syncItem({ id: "a", tags: ["Annual / Recurring Events (by Month)", "USA"] }),
      syncItem({ id: "b", tags: ["Annual / Recurring Events (by Month)", "USA"] }),
    ]);
    for (let i = 0; i < 300; i++) layoutStep(g, 1 - i / 300);
    const [a, b] = g.nodes as [TopicNode, TopicNode];
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual((a.room + b.room) * 0.95);
  });

  it("puts a hovered topic's neighbours on a ring wide enough for their names", () => {
    const g = topicGraph(cards);
    const ring = focusRing(g, 0);
    expect([...ring.keys()]).toEqual([1]);
    const p = ring.get(1)!;
    expect(Math.hypot(p.x - g.nodes[0]!.x, p.y - g.nodes[0]!.y)).toBeGreaterThan(g.nodes[0]!.room);
    expect(focusRing(g, 2).size).toBe(0);
    const box = graphBounds(g);
    expect(box.maxX).toBeGreaterThan(box.minX);
  });
});

describe("no touching names", () => {
  it("leaves no two topics' names overlapping once settled", () => {
    const names = [
      "Annual / Recurring Events (by Month)",
      "USA",
      "Horror",
      "Gardens / Parks",
      "Marvel Cinematic Universe",
      "PC",
      "NES",
      "Cleveland - Downtown",
    ];
    const many = Array.from({ length: 40 }, (_, i) =>
      syncItem({ id: `t${i}`, tags: [names[i % names.length]!, names[(i * 3 + 1) % names.length]!] }),
    );
    const g = topicGraph(many);
    for (let i = 0; i < 260; i++) layoutStep(g, Math.max(0.05, 1 - i / 260));
    for (let i = 0; i < g.nodes.length; i++)
      for (let j = i + 1; j < g.nodes.length; j++) {
        const a = g.nodes[i]!,
          b = g.nodes[j]!;
        const clash = Math.abs(a.x - b.x) < (a.room + b.room) * 0.98 && Math.abs(a.y - b.y) < (a.r + b.r + 26) * 0.98;
        expect(clash).toBe(false);
      }
  });

  it("keeps a hovered topic's two widest neighbours apart on the ring", () => {
    const names = [
      "Hub",
      "Marvel Cinematic Universe",
      "Cleveland - Downtown",
      "American Film Institute",
      "PC",
      "NES",
      "USA",
    ];
    const g = topicGraph(
      Array.from({ length: 12 }, (_, i) => syncItem({ id: `h${i}`, tags: ["Hub", names[1 + (i % 6)]!] })),
    );
    const hub = g.nodes.findIndex((n) => n.key === "hub");
    const ring = [...focusRing(g, hub)];
    for (let k = 0; k < ring.length; k++) {
      const [i, p] = ring[k]!;
      const [j, q] = ring[(k + 1) % ring.length]!;
      expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(g.nodes[i]!.room + g.nodes[j]!.room);
    }
  });
});
