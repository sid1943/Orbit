import { describe, expect, it } from "vitest";
import { importOrbitExport } from "../src/index.js";

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
      cl: [{ n: "Season", i: [["Season 1", 1, null, "e1"]] }],
      due: "2026-12-01T00:00:00Z",
    },
  ],
  ent: { e1: { n: "Dune", cat: "book", conf: "high", ol: "OL893415W", yr: 1965 } },
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
