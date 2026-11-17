import { describe, expect, it } from "vitest";
import { quickMatches, searchItems } from "../src/lib/search.js";
import { syncItem } from "./helpers/sync-item.js";

// Made-up cards.
const cards = [
  syncItem({ id: "a", title: "Poker Face" }),
  syncItem({ id: "b", title: "The Long Harbor", tags: ["ace"] }),
  syncItem({ id: "c", title: "Ace Combat", kind: "Game" }),
  syncItem({ id: "d", title: "Quiet Room", props: { Genre: "Space opera" } }),
];

describe("searchItems", () => {
  it("ranks title matches first and matches word starts only", () => {
    expect(searchItems(cards, "ace").map((i) => i.id)).toEqual(["c", "b"]);
    expect(searchItems(cards, "space").map((i) => i.id)).toEqual(["d"]);
    expect(searchItems(cards, "  ")).toEqual([]);
  });
});

describe("quickMatches", () => {
  it("lists title matches, shortest first", () => {
    const more = [...cards, syncItem({ id: "e", title: "Ace" })];
    expect(quickMatches(more, "ace").map((i) => i.id)).toEqual(["e", "c"]);
    expect(quickMatches(more, "ace", 1)).toHaveLength(1);
  });
});
