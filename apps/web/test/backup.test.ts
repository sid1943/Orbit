import { DEFAULT_PREFS, type Item, importOrbitExport } from "@orbit/core";
import { describe, expect, it } from "vitest";
import { buildBackup } from "../src/lib/backup.js";

const item: Item = {
  id: "a",
  kind: "Movie",
  title: "Demo (1999)",
  status: "todo",
  tags: [],
  source: "",
  props: {},
  notes: "",
  due: null,
  start: null,
  archived: false,
  deleted: true,
  entityId: null,
  refs: [],
  links: [],
  attachments: [],
  comments: [],
  checklists: [],
  coverId: null,
  createdAt: 1,
  updatedAt: 2,
};

const api = {
  allFullItems: async () => [item],
  allEntities: async () => [{ id: "e1", name: "Demo", category: "movie", confidence: "high" as const, updatedAt: 3 }],
  listReviews: async () => [{ entityId: "e1", decision: { d: "yes" as const }, at: 4 }],
};

describe("buildBackup", () => {
  const prefs = { ...DEFAULT_PREFS, profile: { name: "Alex" }, location: { label: "Testville", lat: 1, lng: 2 } };

  it("names the file by date and counts what it holds", async () => {
    const b = await buildBackup(api, prefs, new Date(2026, 10, 17, 9));
    expect(b.name).toBe("orbit-export-2026-11-17.json");
    expect(b.counts).toEqual({ items: 1, entities: 1, reviews: 1 });
  });

  it("writes a file Orbit can load again, settings included", async () => {
    const b = await buildBackup(api, prefs);
    const back = importOrbitExport(JSON.parse(b.json));
    expect(back.items[0]).toMatchObject({ id: "a", deleted: true });
    expect(back.reviews).toEqual([{ entityId: "e1", decision: { d: "yes" }, at: 4 }]);
    expect(back.prefs).toEqual({
      appearance: DEFAULT_PREFS.appearance,
      profile: { name: "Alex" },
      location: { label: "Testville", lat: 1, lng: 2 },
    });
  });
});
