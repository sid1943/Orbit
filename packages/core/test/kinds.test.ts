import { describe, expect, it } from "vitest";
import {
  KINDS,
  countByKind,
  exportOrbit,
  findKind,
  importOrbitExport,
  kindFromSlug,
  kindHue,
  kindList,
  kindNameProblem,
  kindSlug,
  parseCustomKinds,
  reorderKinds,
  suggestHue,
} from "../src/index.js";

// Made-up kinds only.
const custom = [
  { name: "Zine", hue: 40 },
  { name: "Board game", hue: 95 },
];

describe("kindList", () => {
  it("puts the standard kinds first, then custom ones, numbered in order", () => {
    const list = kindList(custom);
    expect(list).toHaveLength(KINDS.length + 2);
    expect(list[0]).toEqual({ name: "To-do", hue: 8, order: 0, standard: true });
    expect(list.slice(-2)).toEqual([
      { name: "Zine", hue: 40, order: 13, standard: false },
      { name: "Board game", hue: 95, order: 14, standard: false },
    ]);
    expect(kindList()).toHaveLength(KINDS.length);
  });
});

describe("parseCustomKinds", () => {
  it("keeps good entries and drops bad, duplicate or standard names", () => {
    expect(
      parseCustomKinds([
        { name: " Zine ", hue: 400 },
        { name: "zine", hue: 1 },
        { name: "movie", hue: 1 },
        { name: "", hue: 1 },
        { name: "!!!", hue: 1 },
        { name: "Comics" },
        "nope",
      ]),
    ).toEqual([{ name: "Zine", hue: 40 }]);
    expect(parseCustomKinds(null)).toEqual([]);
  });
});

describe("kindNameProblem", () => {
  const list = kindList(custom);
  it("refuses empty names and names taken in any capitalization", () => {
    expect(kindNameProblem("  ", list)).toMatch(/needs a name/);
    expect(kindNameProblem("MOVIE", list)).toMatch(/already a kind called Movie/);
    expect(kindNameProblem("zine", list)).toMatch(/Zine/);
    expect(kindNameProblem("board-game", list)).toMatch(/Board game/);
    expect(kindNameProblem("x".repeat(41), list)).toMatch(/at most/);
    expect(kindNameProblem("Comics", list)).toBeNull();
  });

  it("lets a kind keep its own name when renamed (a change of capitals)", () => {
    expect(kindNameProblem("ZINE", list, "Zine")).toBeNull();
    expect(kindNameProblem("Board game", list, "Zine")).not.toBeNull();
  });
});

describe("slugs, hues and lookups", () => {
  const list = kindList(custom);
  it("work for custom kinds", () => {
    expect(kindSlug("Board game")).toBe("board-game");
    expect(kindFromSlug("board-game", list)).toBe("Board game");
    expect(kindFromSlug("to-do", list)).toBe("To-do");
    expect(findKind("zINE", list)?.name).toBe("Zine");
    expect(kindHue("Zine", custom)).toBe(40);
    expect(kindHue("zine", custom)).toBe(40);
    expect(kindHue("Movie", custom)).toBe(265);
    expect(kindHue("Unknown")).toBe(210);
  });
});

describe("countByKind", () => {
  const card = (kind: string, deleted = false) => ({ kind, archived: false, deleted });
  it("follows the kind list, with unknown kinds last", () => {
    const list = kindList(custom);
    const counts = countByKind(
      [card("Board game"), card("Zine"), card("Movie"), card("Other"), card("Zine", true)],
      list,
    );
    expect(counts.map((c) => c.kind)).toEqual(["Movie", "Zine", "Board game", "Other"]);
  });

  it("can include kinds with no cards", () => {
    const counts = countByKind([card("Movie")], kindList(custom), { withEmpty: true });
    expect(counts).toHaveLength(KINDS.length + 2);
    expect(counts.find((c) => c.kind === "Zine")).toEqual({ kind: "Zine", count: 0 });
  });
});

describe("reorderKinds", () => {
  it("needs every custom kind once", () => {
    expect(reorderKinds(custom, ["board game", "Zine"])).toEqual([custom[1], custom[0]]);
    expect(reorderKinds(custom, ["Zine"])).toBeNull();
    expect(reorderKinds(custom, ["Zine", "Zine"])).toBeNull();
    expect(reorderKinds(custom, ["Zine", "Movie"])).toBeNull();
  });
});

describe("suggestHue", () => {
  it("picks a hue away from the ones in use", () => {
    const h = suggestHue([{ hue: 0 }, { hue: 120 }, { hue: 240 }]);
    expect([60, 180, 300]).toContain(h);
  });
});

describe("custom kinds in the export file", () => {
  it("round-trip, and older files without them still load", () => {
    const file = exportOrbit({ items: [], entities: [], reviews: [], kinds: custom });
    expect(file.kinds).toEqual(custom);
    expect(importOrbitExport(JSON.parse(JSON.stringify(file))).prefs.kinds).toEqual(custom);
    const old = { format: "orbit-export", version: 1, exported: "", items: [], ent: {}, reviews: {} };
    expect(importOrbitExport(old).prefs.kinds).toBeUndefined();
  });
});
