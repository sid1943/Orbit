import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE, exportFileName, exportOrbit, importOrbitExport } from "../src/index.js";

const sample = {
  format: "orbit-export",
  version: 1,
  exported: "2026-11-17",
  items: [
    {
      id: "a",
      t: "Run a 10K",
      k: "Health",
      s: "todo",
      cl: [
        {
          n: "Season",
          i: [
            ["Season 1", 1, null, "e1"],
            ["* Fort Ord", 0],
            ["**National Monument**", 0],
          ],
        },
      ],
      due: "2026-12-01T00:00:00Z",
    },
  ],
  ent: {
    e1: { n: "Dune", cat: "book", conf: "high", ol: "OL893415W", yr: 1965 },
    e5: { n: "- Muir Woods", cat: "place", conf: "none" },
  },
  reviews: {
    e1: "yes",
    e2: { d: "fix", url: "https://x.y", add: true },
    e3: "junk",
    e4: { d: "yes", at: 5, guess_q: "Q1" },
  },
};

describe("importOrbitExport", () => {
  const r = importOrbitExport(sample);

  it("maps items, renaming Health and Goal cards to To-do", () => {
    expect(r.items[0]?.kind).toBe("To-do");
    expect(r.items[0]?.due).toBe("2026-12-01");
    expect(r.items[0]?.checklists[0]?.rows[0]?.entityId).toBe("e1");
  });

  it("drops Markdown bullets from row text and names", () => {
    expect(r.items[0]?.checklists[0]?.rows.map((x) => x.text)).toEqual([
      "Season 1",
      "Fort Ord",
      "**National Monument**",
    ]);
    expect(r.entities[1]?.name).toBe("Muir Woods");
  });

  it("maps linked things", () => {
    expect(r.entities[0]?.openLibrary).toBe("OL893415W");
  });

  it("keeps valid review answers with their time and drops junk", () => {
    expect(r.reviews).toHaveLength(3);
    expect(r.reviews[2]?.at).toBe(5);
  });

  it("refuses files that are not Orbit exports", () => {
    expect(() => importOrbitExport({ format: "other" })).toThrow(/Not an Orbit export/);
  });
});

describe("settings in the export", () => {
  it("are optional: files without ui or here import with no settings", () => {
    expect(importOrbitExport(sample).prefs).toEqual({});
  });

  it("map ui to appearance and profile, and here to location", () => {
    const r = importOrbitExport({
      ...sample,
      ui: { size: 1.3, font: "lexend", detail: "text", heads: "fraunces", theme: "auto", name: " Alex " },
      here: { lat: 37.33, lng: -121.89, label: "near Springfield", src: "device", at: 1 },
    });
    expect(r.prefs).toEqual({
      appearance: { size: 1.3, font: "lexend", detail: "text", heads: "fraunces", theme: "system" },
      profile: { name: "Alex" },
      location: { label: "Springfield", lat: 37.33, lng: -121.89 },
    });
  });

  it("skip an empty name and a location that was never set", () => {
    const r = importOrbitExport({ ...sample, ui: { name: "" }, here: null });
    expect(r.prefs).toEqual({ appearance: DEFAULT_APPEARANCE });
  });
});

describe("exportOrbit", () => {
  const first = importOrbitExport(
    {
      ...sample,
      items: [
        ...sample.items,
        {
          id: "b",
          t: "Dune",
          k: "Book",
          s: "done",
          tg: ["scifi"],
          p: { Author: "Frank Herbert" },
          d: "Notes",
          a: 1,
          ent: "e1",
          lk: ["a"],
          lnk: [
            ["Site", "https://a.b", "note"],
            ["Two", "https://c.d"],
          ],
          at: [["File", "https://e.f"]],
          cm: [["2026-01-01", "Great"]],
          _at: 42,
        },
      ],
      ent: { ...sample.ent, e5: { n: "Lisbon", cat: "place", conf: "map", lat: 38.7, lng: -9.1, mq: "Lisbon" } },
      reviews: { e1: "yes", e6: { d: "alt", q: "Q42", label: "Other" }, e7: { d: "hide", urls: ["https://x"] } },
    },
    7,
  );
  const prefs = {
    appearance: { ...DEFAULT_APPEARANCE, theme: "dark" as const },
    profile: { name: "Alex" },
    location: { label: "Springfield", lat: 1, lng: 2 },
  };
  const data = { items: first.items, entities: first.entities, reviews: first.reviews };
  const file = exportOrbit({ ...data, prefs }, new Date("2026-11-17T12:00:00Z"));

  it("writes format orbit-export version 1", () => {
    expect(file).toMatchObject({ format: "orbit-export", version: 1, exported: "2026-11-17T12:00:00.000Z" });
  });

  it("reads back to the same cards, linked things and review answers", () => {
    const again = importOrbitExport(JSON.parse(JSON.stringify(file)), 7);
    expect(again.items).toEqual(first.items.map((i) => ({ ...i, createdAt: i.updatedAt })));
    expect(again.entities).toEqual(first.entities);
    expect(again.reviews).toEqual(first.reviews);
  });

  it("writes settings the way Orbit today keeps them, and reads them back", () => {
    expect(file.ui).toEqual({
      size: 1.15,
      font: "plex",
      detail: "mono",
      heads: "display",
      theme: "dark",
      name: "Alex",
    });
    expect(file.here).toEqual({ label: "Springfield", lat: 1, lng: 2 });
    expect(importOrbitExport(JSON.parse(JSON.stringify(file))).prefs).toEqual(prefs);
  });

  it("writes 'system' as Orbit today's 'auto', and an unset location as null", () => {
    const f = exportOrbit({ ...data, prefs: { ...prefs, appearance: DEFAULT_APPEARANCE, location: null } });
    expect(f.ui?.theme).toBe("auto");
    expect(f.here).toBeNull();
  });

  it("leaves settings out when none are given", () => {
    expect(exportOrbit(data)).not.toHaveProperty("ui");
  });
});

describe("exportFileName", () => {
  it("uses the local date", () => {
    expect(exportFileName(new Date(2026, 0, 5, 23))).toBe("orbit-export-2026-01-05.json");
  });
});
