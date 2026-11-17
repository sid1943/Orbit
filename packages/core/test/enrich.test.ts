import { describe, expect, it } from "vitest";
import { enrichItem, enrichKind, splitAuthor, splitYear } from "../src/index.js";
import { cannedFetch, noFetch } from "./helpers/fetch.js";

describe("title parsing", () => {
  it("splits off a year or year range", () => {
    expect(splitYear("Dune (2021)")).toEqual({ title: "Dune", year: 2021 });
    expect(splitYear("Westworld (2016– )")).toEqual({ title: "Westworld", year: 2016 });
    expect(splitYear("Friends (1994–2004)")).toEqual({ title: "Friends", year: 1994 });
    expect(splitYear("1917")).toEqual({ title: "1917" });
  });

  it("splits off an author", () => {
    expect(splitAuthor("The Hobbit by J.R.R. Tolkien")).toEqual({ title: "The Hobbit", author: "J.R.R. Tolkien" });
    expect(splitAuthor("Dune - Frank Herbert")).toEqual({ title: "Dune", author: "Frank Herbert" });
  });
});

describe("enrichKind", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `Row ${i}`, done: false }));

  it("gives list cards no link of their own", () => {
    expect(enrichKind({ kind: "Movie", checklists: [{ name: "Movies", rows: rows(40) }] })).toBeNull();
  });

  it("does not treat a show's seasons as a list", () => {
    expect(enrichKind({ kind: "Show", checklists: [{ name: "Seasons", rows: rows(15) }] })).toBe("show");
  });

  it("does not look up kinds without a standard source", () => {
    expect(enrichKind({ kind: "Experience" })).toBeNull();
  });
});

describe("enrichItem", () => {
  it("uses an IMDb address already in the notes, with no lookups", async () => {
    const r = await enrichItem(noFetch, {
      kind: "Show",
      title: "Westworld (2016– )",
      props: {},
      notes: "Set in a park.\nhttps://www.imdb.com/title/tt0475784/?ref_=nv_sr",
    });
    expect(r.confidence).toBe("high");
    expect(r.entity?.imdb).toBe("tt0475784");
  });

  it("matches the series, never an episode with the same name", async () => {
    const claims = (p31: string, imdb: string, year: string) => ({
      P31: [{ mainsnak: { datavalue: { value: { id: p31 } } } }],
      P345: [{ mainsnak: { datavalue: { value: imdb } } }],
      P580: [{ mainsnak: { datavalue: { value: { time: `+${year}-01-20T00:00:00Z` } } } }],
    });
    const fetch = cannedFetch([
      ["wbsearchentities", { search: [{ id: "Q1" }, { id: "Q2" }] }],
      ["list=search", { query: { search: [] } }],
      [
        "wbgetentities",
        {
          entities: {
            Q1: {
              labels: { en: { value: "Breaking Bad" } },
              descriptions: { en: { value: "American crime drama television series" } },
              claims: claims("Q5398426", "tt0903747", "2008"),
            },
            Q2: {
              labels: { en: { value: "Breaking Bad" } },
              descriptions: { en: { value: "episode of Better Call Saul" } },
              claims: claims("Q21191270", "tt1234567", "2022"),
            },
          },
        },
      ],
    ]);
    const r = await enrichItem(fetch, { kind: "Show", title: "Breaking Bad", props: {} });
    expect(r.confidence).toBe("high");
    expect(r.entity?.imdb).toBe("tt0903747");
    expect(r.alternatives).toHaveLength(0);
  });

  it("links a book on exact title and author, with its cover", async () => {
    const fetch = cannedFetch([
      [
        "openlibrary.org/search.json",
        {
          docs: [
            { key: "/works/OL27482W", title: "The Hobbit", author_name: ["J.R.R. Tolkien"], cover_i: 14627509 },
            { key: "/works/OL1W", title: "The Hobbit Companion", author_name: ["David Day"] },
          ],
        },
      ],
    ]);
    const r = await enrichItem(fetch, { kind: "Book", title: "The Hobbit by Tolkien", props: {} });
    expect(r.confidence).toBe("high");
    expect(r.entity?.openLibrary).toBe("OL27482W");
    expect(r.coverUrl).toMatch(/covers\.openlibrary\.org\/b\/id\/14627509/);
  });

  it("gives places a map link without lookups, and other kinds nothing", async () => {
    const place = await enrichItem(noFetch, { kind: "Place", title: "Mahar Point", props: { Location: "Maine" } });
    expect(place.confidence).toBe("map");
    expect(place.entity?.mapQuery).toBe("Mahar Point, Maine");
    expect((await enrichItem(noFetch, { kind: "Note", title: "x", props: {} })).confidence).toBe("nolink");
  });

  describe("strict back-fill", () => {
    it("skips header cards with no year or author", async () => {
      expect(
        (await enrichItem(noFetch, { kind: "Movie", title: "Genre", props: {} }, { strict: true })).confidence,
      ).toBe("none");
      expect(
        (await enrichItem(noFetch, { kind: "Book", title: "Pulitzer Prize", props: {} }, { strict: true })).confidence,
      ).toBe("none");
    });

    it("drops unsure matches that a new card would send to review", async () => {
      const fetch = cannedFetch([
        [
          "openlibrary.org/search.json",
          { docs: [{ key: "/works/OL9W", title: "Something Else", author_name: ["Nobody"] }] },
        ],
      ]);
      const card = { kind: "Book", title: "Dune by Frank Herbert", props: {} };
      expect((await enrichItem(fetch, card, { strict: true })).confidence).toBe("none");
      expect((await enrichItem(fetch, card)).confidence).toBe("review");
    });
  });
});
