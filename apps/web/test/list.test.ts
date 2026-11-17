import { describe, expect, it } from "vitest";
import { groupItems, listItems, parseGroup, parseStatus } from "../src/lib/list.js";
import { syncItem } from "./helpers/sync-item.js";

// Made-up cards.
const cards = [
  syncItem({ id: "a", kind: "Book", status: "done", updatedAt: 9 }),
  syncItem({ id: "b", kind: "Movie", status: "todo", updatedAt: 3 }),
  syncItem({ id: "c", kind: "Movie", status: "doing", updatedAt: 1 }),
  syncItem({ id: "d", kind: "Movie", archived: true }),
  syncItem({ id: "e", kind: "Movie", deleted: true }),
];

describe("listItems", () => {
  it("filters by kind and status and keeps list order", () => {
    expect(listItems(cards, { status: "all", showArchived: false }).map((i) => i.id)).toEqual(["c", "b", "a"]);
    expect(listItems(cards, { kind: "Movie", status: "all", showArchived: true }).map((i) => i.id)).toEqual([
      "c",
      "b",
      "d",
    ]);
    expect(listItems(cards, { status: "done", showArchived: false }).map((i) => i.id)).toEqual(["a"]);
  });
});

describe("groupItems", () => {
  it("groups by kind or status, leaving out empty groups", () => {
    const list = listItems(cards, { status: "all", showArchived: false });
    expect(groupItems(list, "none")).toHaveLength(1);
    expect(groupItems(list, "kind").map((g) => g.label)).toEqual(["Movie", "Book"]);
    expect(groupItems(list, "status").map((g) => [g.label, g.items.length])).toEqual([
      ["To do", 1],
      ["Doing", 1],
      ["Done", 1],
    ]);
  });

  it("reads the URL values safely", () => {
    expect(parseStatus("doing")).toBe("doing");
    expect(parseStatus("nope")).toBe("all");
    expect(parseGroup("kind")).toBe("kind");
    expect(parseGroup(null)).toBe("none");
  });
});
