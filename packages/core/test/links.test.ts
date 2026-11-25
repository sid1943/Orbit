import { describe, expect, it } from "vitest";
import { entityLinks, goodreadsLink } from "../src/index.js";

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

describe("goodreadsLink", () => {
  const book = { name: "Sand Planet by Ada Example", confidence: "high" as const };
  it("opens the work's page when Goodreads' work id is known", () => {
    expect(goodreadsLink({ ...book, goodreads: "123", goodreadsBook: "9" })?.url).toBe(
      "https://www.goodreads.com/work/best_book/123",
    );
  });
  it("opens the edition's page with only a book id", () => {
    expect(goodreadsLink({ ...book, goodreadsBook: "9" })?.url).toBe("https://www.goodreads.com/book/show/9");
  });
  it("searches Goodreads otherwise, adding the author when the title lacks it", () => {
    expect(goodreadsLink(book)?.url).toBe("https://www.goodreads.com/search?q=Sand%20Planet%20by%20Ada%20Example");
    expect(goodreadsLink({ name: "Sand Planet", author: "Ada Example", confidence: "none" })?.url).toBe(
      "https://www.goodreads.com/search?q=Sand%20Planet%20Ada%20Example",
    );
  });
  it("gives nothing for a row that isn't a book", () => {
    expect(goodreadsLink({ name: "Fiction", confidence: "nolink" })).toBeNull();
  });
  it("is a book's only standard link", () => {
    const links = entityLinks({ id: "b", category: "book", openLibrary: "OL1W", updatedAt: 0, ...book });
    expect(links.map((l) => l.label)).toEqual(["Goodreads"]);
  });
});
