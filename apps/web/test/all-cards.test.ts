import type { PlaceRow } from "@orbit/core";
import { describe, expect, it } from "vitest";
import {
  NO_FILTERS,
  activeFilterCount,
  allCards,
  closestMiles,
  kindChoices,
  readFilters,
  writeFilters,
} from "../src/lib/all-cards.js";
import { syncItem } from "./helpers/sync-item.js";

// Made-up cards and places. Tuesday, November 17, 2026.
const NOW = new Date(2026, 10, 17, 12);
const HOME = { lat: 37.3382, lng: -121.8863 };

const cards = [
  syncItem({ id: "m1", kind: "Movie", title: "Harbor Lights", tags: ["Noir"], updatedAt: 5 }),
  syncItem({ id: "m2", kind: "Movie", title: "Atlas Road", status: "done", updatedAt: 9 }),
  syncItem({ id: "p1", kind: "Place", title: "Parks list", status: "doing", updatedAt: 1 }),
  syncItem({ id: "e1", kind: "Experience", title: "Lantern fair", props: { "Preferable Time": "December 5" } }),
  syncItem({ id: "e2", kind: "Experience", title: "Leaf walk", props: { "Preferable Time": "Fall" } }),
  syncItem({ id: "a1", kind: "Note", title: "Old note", archived: true }),
];

const place = (over: Partial<PlaceRow>): PlaceRow => ({
  itemId: "p1",
  checklist: 0,
  row: 0,
  text: "Somewhere",
  done: false,
  entityId: "e",
  category: "natural_place",
  confidence: "high",
  lat: null,
  lng: null,
  location: null,
  ...over,
});
const places = [
  place({ row: 0, lat: 37.25, lng: -121.8 }), // ~8 mi
  place({ row: 1, lat: 36.1, lng: -115.17 }), // far
  place({ itemId: "e1", checklist: null, row: null, lat: 37.78, lng: -122.42 }), // ~42 mi
];

const ids = (r: { items: { id: string }[] }) => r.items.map((i) => i.id);

describe("readFilters / writeFilters", () => {
  it("round-trips and drops defaults", () => {
    const f = { ...NO_FILTERS, status: "done" as const, topic: "noir", within: 25 as const, archived: true };
    const p = writeFilters(new URLSearchParams("all=1"), f);
    expect(p.toString()).toBe("all=1&status=done&topic=noir&within=25&archived=1");
    expect(readFilters(p)).toEqual(f);
    expect(readFilters(new URLSearchParams("within=7&when=nope&sort=x"))).toEqual(NO_FILTERS);
  });
  it("counts the filters in force", () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...NO_FILTERS, kind: "Movie", group: "kind", sort: "title" })).toBe(1);
  });
});

describe("allCards", () => {
  const base = { showArchived: false, now: NOW };

  it("filters by status, kind, topic and archived", () => {
    expect(ids(allCards(cards, NO_FILTERS, base))).toEqual(["p1", "m1", "e1", "e2", "m2"]);
    expect(ids(allCards(cards, { ...NO_FILTERS, status: "done" }, base))).toEqual(["m2"]);
    expect(ids(allCards(cards, { ...NO_FILTERS, kind: "Movie" }, base))).toEqual(["m1", "m2"]);
    expect(ids(allCards(cards, { ...NO_FILTERS, topic: "noir" }, base))).toEqual(["m1"]);
    expect(ids(allCards(cards, { ...NO_FILTERS, archived: true }, base))).toContain("a1");
  });

  it("filters by when", () => {
    expect(ids(allCards(cards, { ...NO_FILTERS, when: "soon" }, base))).toEqual(["e1"]);
    expect(ids(allCards(cards, { ...NO_FILTERS, when: "season" }, base))).toEqual(["e2"]);
    expect(ids(allCards(cards, { ...NO_FILTERS, when: "dated" }, base))).toEqual(["e1", "e2"]);
  });

  it("filters and sorts by distance to the closest place on a card", () => {
    const opts = { ...base, places, here: HOME };
    expect(ids(allCards(cards, { ...NO_FILTERS, within: 25 }, opts))).toEqual(["p1"]);
    expect(ids(allCards(cards, { ...NO_FILTERS, within: 100, sort: "near" }, opts))).toEqual(["p1", "e1"]);
    // Without a location the distance filter is ignored.
    expect(ids(allCards(cards, { ...NO_FILTERS, within: 5 }, base))).toHaveLength(5);
  });

  it("sorts by title", () => {
    expect(ids(allCards(cards, { ...NO_FILTERS, sort: "title" }, base))).toEqual(["m2", "m1", "e1", "e2", "p1"]);
  });
});

describe("closestMiles and kindChoices", () => {
  it("keeps each card's closest place", () => {
    const m = closestMiles(places, cards, HOME);
    expect(Math.round(m.get("p1")!)).toBe(8);
    expect(m.has("m1")).toBe(false);
  });
  it("lists kinds in use, standard order first", () => {
    expect(kindChoices([...cards, syncItem({ id: "z", kind: "Zine" })])).toEqual([
      "Experience",
      "Place",
      "Movie",
      "Note",
      "Zine",
    ]);
  });
});
