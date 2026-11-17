import { kindList } from "@orbit/core";
import { describe, expect, it } from "vitest";
import { kindTiles } from "../src/lib/kinds.js";
import { syncItem } from "./helpers/sync-item.js";

// Made-up cards and kinds.
const kinds = kindList([
  { name: "Zine", hue: 15 },
  { name: "Board game", hue: 70 },
]);

describe("kindTiles", () => {
  it("shows standard kinds with cards and every custom kind, in list order", () => {
    const tiles = kindTiles(
      [
        syncItem({ id: "a", kind: "Movie" }),
        syncItem({ id: "b", kind: "Zine" }),
        syncItem({ id: "c", kind: "Book", archived: true }),
      ],
      kinds,
    );
    expect(tiles).toEqual([
      { kind: "Movie", count: 1 },
      { kind: "Zine", count: 1 },
      { kind: "Board game", count: 0 },
    ]);
  });
});
