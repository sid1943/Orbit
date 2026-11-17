import type { PlaceRow } from "@orbit/core";
import { describe, expect, it } from "vitest";
import { nearMe, parseRadius } from "../src/lib/near-me.js";
import { placeDistance, placeMapLink } from "../src/lib/near-you.js";
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
  syncItem({ id: "food", kind: "Place", title: "Food to try" }),
  syncItem({ id: "gone", title: "Archived list", archived: true }),
];

const places = [
  place({ row: 0, text: "Granite Falls", lat: 37.25, lng: -121.8 }),
  place({ row: 1, text: "Ticked trail", done: true, lat: 37.34, lng: -121.89 }),
  place({ row: 2, text: "Far canyon", lat: 36.1, lng: -115.17 }),
  place({ row: 3, text: "Museum of Clocks", category: "museum", lat: 37.77, lng: -122.42 }),
  place({ itemId: "gone", text: "Hidden", lat: 37.34, lng: -121.88 }),
  place({ itemId: "food", row: 0, text: "Taco stand", category: "eatery", location: "San Jose, CA" }),
  place({ itemId: "food", row: 1, text: "Noodle bar", category: "eatery", location: "Santa Clara" }),
  place({ itemId: "food", row: 2, text: "Dumpling house", category: "eatery", location: "Seattle, WA" }),
];

const opts = { radius: 100, showDone: false, category: null } as const;

describe("parseRadius", () => {
  it("reads the distance from the address, 100 by default", () => {
    expect(parseRadius("25")).toBe(25);
    expect(parseRadius("any")).toBe("any");
    expect(parseRadius(null)).toBe(100);
    expect(parseRadius("7")).toBe(100);
  });
});

describe("nearMe", () => {
  it("lists open exact places in range closest first, then city groups closest first", () => {
    const n = nearMe(places, cards, HOME, opts);
    expect(n.exact.map((p) => p.label)).toEqual(["Granite Falls", "Museum of Clocks"]);
    expect(n.cities.map((g) => [g.city, g.places.map((p) => p.label)])).toEqual([
      ["San Jose", ["Taco stand"]],
      ["Santa Clara", ["Noodle bar"]],
    ]);
    expect(n.count).toBe(4);
    expect(n.inRange).toBe(4);
  });

  it("widens with the distance and shows done places when asked", () => {
    expect(nearMe(places, cards, HOME, { ...opts, radius: "any" }).count).toBe(6);
    expect(nearMe(places, cards, HOME, { ...opts, radius: 5 }).exact.map((p) => p.label)).toEqual([]);
    const done = nearMe(places, cards, HOME, { ...opts, radius: 5, showDone: true });
    expect(done.exact.map((p) => [p.label, p.done])).toEqual([["Ticked trail", true]]);
  });

  it("counts categories in range and filters by a chip", () => {
    const n = nearMe(places, cards, HOME, { ...opts, category: "museum" });
    expect(n.categories).toEqual([
      { category: "eatery", label: "Places to eat", count: 2 },
      { category: "museum", label: "Museums", count: 1 },
      { category: "natural_place", label: "Natural places", count: 1 },
    ]);
    expect(n.category).toBe("museum");
    expect(n.exact.map((p) => p.label)).toEqual(["Museum of Clocks"]);
    expect(n.inRange).toBe(4);
  });

  it("drops a chip with nothing in range", () => {
    const n = nearMe(places, cards, HOME, { ...opts, radius: 5, category: "museum" });
    expect(n.category).toBeNull();
  });

  it("keeps the closest open place for an empty list, and hides archived cards", () => {
    const n = nearMe(places.slice(0, 4), cards, { lat: 47.6, lng: -122.3 }, { ...opts, radius: 5 });
    expect(n.count).toBe(0);
    expect(n.closest?.label).toBe("Museum of Clocks");
    expect(nearMe(places, cards, HOME, { ...opts, showArchived: true }).exact[0]?.label).toBe("Hidden");
  });
});

describe("placeDistance", () => {
  it("shows exact miles, a close city, or approximate miles", () => {
    expect(placeDistance({ miles: 12.4, approx: false, city: null })).toBe("12 mi");
    expect(placeDistance({ miles: 3, approx: true, city: "San Jose" })).toBe("in San Jose");
    expect(placeDistance({ miles: 700, approx: true, city: "Seattle" })).toBe("~700 mi");
  });
});

describe("placeMapLink", () => {
  it("searches the name with the list's location", () => {
    const [p] = nearMe(places, cards, HOME, opts).cities[0]!.places;
    expect(placeMapLink(p!)).toBe(
      "https://www.google.com/maps/search/?api=1&query=Taco%20stand%2C%20San%20Jose%2C%20CA",
    );
  });
});
