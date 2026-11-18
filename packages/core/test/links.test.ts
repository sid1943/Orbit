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

  it("gives a book a Goodreads search by title and author", () => {
    const links = entityLinks({
      id: "b",
      name: "Harbor Lights",
      category: "book",
      confidence: "high",
      openLibrary: "OL1W",
      author: "A. Writer",
      updatedAt: 0,
    });
    expect(links.map((l) => [l.label, l.url])).toEqual([
      ["Open Library", "https://openlibrary.org/works/OL1W"],
      ["Goodreads", "https://www.goodreads.com/search?q=Harbor%20Lights%20A.%20Writer"],
    ]);
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
