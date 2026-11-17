import { describe, expect, it } from "vitest";
import {
  checklistProgress,
  mergeSync,
  reviewedLinked,
  toSyncItem,
  upsertSyncItem,
  type Item,
  type SyncItem,
} from "../src/index.js";

// Made-up examples only.
const card = (over: Partial<Item> = {}): Item => ({
  id: "it1",
  kind: "Movie",
  title: "Harbor Lights",
  status: "todo",
  tags: ["noir"],
  source: "Added in Orbit",
  props: { Year: "1999" },
  notes: "",
  due: null,
  start: null,
  archived: false,
  deleted: false,
  entityId: null,
  refs: [],
  links: [],
  attachments: [],
  comments: [],
  checklists: [],
  coverId: null,
  createdAt: 1,
  updatedAt: 2,
  ...over,
});

const row = (id: string, updatedAt: number): SyncItem => toSyncItem(card({ id, updatedAt }));

describe("checklistProgress", () => {
  it("counts ticked rows across checklists", () => {
    const it = card({
      checklists: [
        {
          name: "A",
          rows: [
            { text: "a", done: true },
            { text: "b", done: false },
          ],
        },
        { name: "B", rows: [{ text: "c", done: true }] },
      ],
    });
    expect(checklistProgress(it)).toEqual({ done: 2, total: 3 });
    expect(checklistProgress(card())).toEqual({ done: 0, total: 0 });
  });
});

describe("toSyncItem", () => {
  it("keeps the light fields and the linked thing only when the card is linked", () => {
    const linked = {
      category: "movie",
      confidence: "high" as const,
      lat: null,
      lng: null,
      cover: "https://c.example/x.jpg",
    };
    expect(toSyncItem(card(), linked)).toMatchObject({ category: null, cover: null, tags: ["noir"], done: 0 });
    expect(toSyncItem(card({ entityId: "e1" }), linked)).toMatchObject({ category: "movie", cover: linked.cover });
  });
});

describe("reviewedLinked", () => {
  const base = { confidence: "review" as const, lat: 1, lng: 2 };
  it("follows Sid's answer", () => {
    expect(reviewedLinked(base, null)).toEqual(base);
    expect(reviewedLinked(base, { d: "yes" })).toMatchObject({ confidence: "high", lat: 1 });
    expect(reviewedLinked(base, { d: "no" })).toEqual({ confidence: "rejected", lat: null, lng: null });
    expect(reviewedLinked(base, { d: "fix", add: true })).toEqual(base);
    expect(reviewedLinked(base, { d: "fix", add: false })).toMatchObject({ confidence: "user", lat: null });
  });
});

describe("mergeSync", () => {
  it("adds, replaces and removes cards, newest first", () => {
    const first = mergeSync(undefined, { items: [row("a", 1), row("b", 2)], removed: [], at: 10 });
    expect(first.items.map((i) => i.id)).toEqual(["b", "a"]);
    const next = mergeSync(first, { items: [row("a", 5)], removed: ["b"], at: 20 });
    expect(next.items.map((i) => [i.id, i.updatedAt])).toEqual([["a", 5]]);
    expect(next.at).toBe(20);
  });
});

describe("upsertSyncItem", () => {
  it("puts an edited card in place and keeps its linked thing", () => {
    const linked = toSyncItem(card({ entityId: "e1" }), {
      category: "movie",
      confidence: "high",
      lat: null,
      lng: null,
      cover: "https://c.example/x.jpg",
    });
    const state = { items: [linked], at: 9 };
    const edited = upsertSyncItem(state, card({ entityId: "e1", title: "Harbor Lights II", updatedAt: 3 }));
    expect(edited.items[0]).toMatchObject({ title: "Harbor Lights II", cover: "https://c.example/x.jpg" });
    expect(upsertSyncItem(state, null, "it1").items).toEqual([]);
  });
});
