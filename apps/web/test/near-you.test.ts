import type { PlaceRow } from "@orbit/core";
import { describe, expect, it } from "vitest";
import { nearYou, placesWithSpot } from "../src/lib/near-you.js";
import { syncItem } from "./helpers/sync-item.js";

// Made-up places around a made-up home.
const HOME = { lat: 37.3382, lng: -121.8863 };
const place = (over: Partial<PlaceRow>): PlaceRow => ({
  itemId: "list",
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

const cards = [
  syncItem({ id: "list", kind: "Place", title: "Parks to visit" }),
  syncItem({ id: "card", kind: "Place", title: "Harbor Overlook" }),
  syncItem({ id: "gone", title: "Archived list", archived: true }),
];

const places = [
  place({ row: 0, text: "1. **Granite Falls**", lat: 37.25, lng: -121.8 }),
  place({ row: 1, text: "Ticked trail", done: true, lat: 37.34, lng: -121.89 }),
  place({ row: 2, text: "Far canyon", lat: 36.1, lng: -115.17 }),
  place({ itemId: "card", checklist: null, row: null, text: "Harbor Overlook", lat: 37.33, lng: -121.88 }),
  place({ itemId: "gone", text: "Hidden", lat: 37.34, lng: -121.88 }),
  place({ row: 3, text: "Taco stand", category: "eatery", location: "San Jose, CA" }),
  place({ row: 4, text: "Noodle bar", category: "eatery", location: "San Jose" }),
  place({ row: 5, text: "Mystery", category: "eatery", location: "Nowhere Town" }),
];

describe("nearYou", () => {
  it("lists open rows and cards with exact spots within 100 miles, closest first", () => {
    const n = nearYou(places, cards, HOME);
    expect(n.close.map((p) => [p.label, p.card.title])).toEqual([
      ["Harbor Overlook", "Harbor Overlook"],
      ["Granite Falls", "Parks to visit"],
    ]);
    expect(n.closest?.label).toBe("Taco stand");
  });

  it("counts city-list places without a spot by city", () => {
    expect(nearYou(places, cards, HOME).towns).toEqual([{ city: "San Jose", count: 2 }]);
  });

  it("follows the card's status for a card that is itself the place", () => {
    const done = cards.map((c) => (c.id === "card" ? { ...c, status: "done" as const } : c));
    expect(nearYou(places, done, HOME).close.map((p) => p.label)).toEqual(["Granite Falls"]);
  });

  it("shows archived cards only when asked", () => {
    expect(nearYou(places, cards, HOME, true).close.some((p) => p.label === "Hidden")).toBe(true);
  });
});

describe("placesWithSpot", () => {
  it("counts places on visible cards that have a spot or a known city", () => {
    expect(placesWithSpot(places, cards)).toBe(6);
  });
});
