import { describe, expect, it } from "vitest";
import {
  CITIES,
  categoryLabel,
  findCity,
  cityCenter,
  mergePlaces,
  placeLabel,
  placeSpot,
  placesByDistance,
  reviewedPlace,
  type PlaceRow,
} from "../src/index.js";

// Made-up places only.
const place = (over: Partial<PlaceRow> = {}): PlaceRow => ({
  itemId: "list",
  checklist: 0,
  row: 0,
  text: "Somewhere",
  done: false,
  entityId: "p0",
  category: "natural_place",
  confidence: "map",
  lat: null,
  lng: null,
  location: null,
  ...over,
});

const sanJose = CITIES.find((c) => c.name === "San Jose, CA")!;

describe("cityCenter", () => {
  it("places a city list's row at its city when the location starts with a known city", () => {
    expect(cityCenter("city_todo", "San Jose, California")).toMatchObject({ city: "San Jose", lat: sanJose.lat });
    expect(cityCenter("eatery", "Palo Alto - Downtown, CA")).toMatchObject({ city: "Palo Alto" });
  });

  it("doesn't guess for other lists or unknown towns", () => {
    expect(cityCenter("natural_place", "San Jose, California")).toBeNull();
    expect(cityCenter("city_todo", "Smallville, Kansas")).toBeNull();
    expect(cityCenter("city_todo", null)).toBeNull();
  });
});

describe("placeSpot", () => {
  it("uses the exact spot, then the city center", () => {
    expect(placeSpot(place({ lat: 1, lng: 2 }))).toEqual({ lat: 1, lng: 2, approx: false, city: null });
    expect(placeSpot(place({ category: "city_todo", location: "San Jose, CA" }))).toMatchObject({
      approx: true,
      city: "San Jose",
    });
  });

  it("skips head offices and things that aren't places to go", () => {
    expect(placeSpot(place({ category: "chain", lat: 1, lng: 2 }))).toBeNull();
    expect(placeSpot(place({ category: "movie" }))).toBeNull();
  });
});

describe("placeLabel", () => {
  it("drops numbering, bold marks and tabs", () => {
    expect(placeLabel("12. **Old Mill**\tTrail")).toBe("Old Mill · Trail");
  });
});

describe("placesByDistance", () => {
  it("sorts places with a spot, closest first, and marks city-center ones", () => {
    const here = { lat: sanJose.lat, lng: sanJose.lng };
    const list = [
      place({ entityId: "far", lat: sanJose.lat + 2, lng: sanJose.lng }),
      place({ entityId: "near", lat: sanJose.lat + 0.01, lng: sanJose.lng }),
      place({ entityId: "town", category: "city_todo", location: "San Jose, CA" }),
      place({ entityId: "none", category: "movie" }),
    ];
    const out = placesByDistance(list, here);
    expect(out.map((x) => x.place.entityId)).toEqual(["town", "near", "far"]);
    expect(out[0]).toMatchObject({ approx: true, city: "San Jose", miles: 0 });
  });
});

describe("reviewedPlace", () => {
  it("drops the spot of a rejected guess", () => {
    expect(reviewedPlace(place({ lat: 1, lng: 2, confidence: "review" }), { d: "no" })).toMatchObject({
      lat: null,
      confidence: "rejected",
    });
  });
});

describe("mergePlaces", () => {
  it("replaces everything on a full answer and only changed cards otherwise", () => {
    const a = place({ itemId: "a", entityId: "a1" });
    const b = place({ itemId: "b", entityId: "b1" });
    const full = mergePlaces(undefined, { places: [a, b], items: null, at: 10 });
    expect(full.places).toHaveLength(2);
    const b2 = place({ itemId: "b", entityId: "b2" });
    const next = mergePlaces(full, { places: [b2], items: ["b", "gone"], at: 20 });
    expect(next.places.map((p) => p.entityId)).toEqual(["a1", "b2"]);
    expect(mergePlaces(next, { places: [], items: ["a"], at: 30 }).places.map((p) => p.entityId)).toEqual(["b2"]);
  });
});

describe("findCity", () => {
  it("finds a listed city by full name, start or first part", () => {
    expect(findCity("San Jose, CA")?.name).toBe("San Jose, CA");
    expect(findCity("san j")?.name).toBe("San Jose, CA");
    expect(findCity("Cleveland, Ohio")?.name).toBe("Cleveland, OH");
  });

  it("finds an extra town center, title-cased", () => {
    expect(findCity("hoboken")).toEqual({ name: "Hoboken", lat: 40.744, lng: -74.0324 });
  });

  it("returns null for unknown or too-short names", () => {
    expect(findCity("Atlantis")).toBeNull();
    expect(findCity("s")).toBeNull();
  });
});

describe("categoryLabel", () => {
  it("uses Orbit today's names, then readable raw names", () => {
    expect(categoryLabel("city_todo")).toBe("City to-dos");
    expect(categoryLabel("fed_bank")).toBe("Federal Reserve banks");
    expect(categoryLabel("new_kind_of_place")).toBe("New kind of place");
  });
});
