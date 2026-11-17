import { describe, expect, it } from "vitest";
import { entityLinks } from "../src/index.js";

describe("entityLinks", () => {
  it("gives a movie its IMDb link and no map", () => {
    const links = entityLinks({
      id: "e",
      name: "Se7en",
      category: "movie",
      confidence: "high",
      imdb: "tt0114369",
      updatedAt: 0,
    });
    expect(links.map((l) => l.label)).toEqual(["IMDb"]);
  });

  it("gives a place a map link", () => {
    const links = entityLinks({
      id: "p",
      name: "Mahar Point",
      category: "natural_place",
      confidence: "map",
      mapQuery: "Mahar Point, Maine, USA",
      updatedAt: 0,
    });
    expect(links.map((l) => l.label)).toEqual(["Map"]);
  });
});
