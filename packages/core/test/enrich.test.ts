import { test } from "vitest";
import assert from "node:assert/strict";
import { enrichItem, enrichKind, splitAuthor, splitYear, nextCheckAfter, type Fetch } from "../src/index.js";

/** A fetch that answers from canned JSON, picked by a piece of the URL. */
const canned = (routes: [string, unknown][]): Fetch => async (url) => {
  const hit = routes.find(([part]) => url.includes(part));
  return { ok: !!hit, status: hit ? 200 : 404, json: async () => hit?.[1] };
};

test("titles: year and author are split off", () => {
  assert.deepEqual(splitYear("Dune (2021)"), { title: "Dune", year: 2021 });
  assert.deepEqual(splitYear("1917"), { title: "1917" });
  assert.deepEqual(splitAuthor("The Hobbit by J.R.R. Tolkien"), { title: "The Hobbit", author: "J.R.R. Tolkien" });
  assert.deepEqual(splitAuthor("Dune - Frank Herbert"), { title: "Dune", author: "Frank Herbert" });
});

test("a show matches the series, never an episode with the same name", async () => {
  const claims = (p31: string, imdb: string, year: string) => ({
    P31: [{ mainsnak: { datavalue: { value: { id: p31 } } } }],
    P345: [{ mainsnak: { datavalue: { value: imdb } } }],
    P580: [{ mainsnak: { datavalue: { value: { time: `+${year}-01-20T00:00:00Z` } } } }],
  });
  const fetch = canned([
    ["wbsearchentities", { search: [{ id: "Q1" }, { id: "Q2" }] }],
    ["list=search", { query: { search: [] } }],
    ["wbgetentities", { entities: {
      Q1: { labels: { en: { value: "Breaking Bad" } }, descriptions: { en: { value: "American crime drama television series" } }, claims: claims("Q5398426", "tt0903747", "2008") },
      Q2: { labels: { en: { value: "Breaking Bad" } }, descriptions: { en: { value: "episode of Better Call Saul" } }, claims: claims("Q21191270", "tt1234567", "2022") },
    } }],
  ]);
  const r = await enrichItem(fetch, { kind: "Show", title: "Breaking Bad", props: {} });
  assert.equal(r.confidence, "high");
  assert.equal(r.entity?.imdb, "tt0903747");
  assert.equal(r.alternatives.length, 0);
});

test("books: exact title with matching author is high; cover comes along", async () => {
  const fetch = canned([["openlibrary.org/search.json", { docs: [
    { key: "/works/OL27482W", title: "The Hobbit", author_name: ["J.R.R. Tolkien"], first_publish_year: 1937, cover_i: 14627509 },
    { key: "/works/OL1W", title: "The Hobbit Companion", author_name: ["David Day"] },
  ] }]]);
  const r = await enrichItem(fetch, { kind: "Book", title: "The Hobbit by Tolkien", props: {} });
  assert.equal(r.confidence, "high");
  assert.equal(r.entity?.openLibrary, "OL27482W");
  assert.match(r.coverUrl ?? "", /covers\.openlibrary\.org\/b\/id\/14627509/);
});

test("places get a map link without any lookups; notes get nothing", async () => {
  const boom: Fetch = async () => { throw new Error("should not fetch"); };
  const p = await enrichItem(boom, { kind: "Place", title: "Mahar Point", props: { Location: "Maine" } });
  assert.equal(p.confidence, "map");
  assert.equal(p.entity?.mapQuery, "Mahar Point, Maine");
  assert.equal((await enrichItem(boom, { kind: "Note", title: "x", props: {} })).confidence, "nolink");
});

test("running shows are checked more often than ended ones", () => {
  assert.ok(nextCheckAfter({ status: "Running", nextEpisode: null }) < nextCheckAfter({ status: "Ended", nextEpisode: null }));
  assert.equal(nextCheckAfter({ status: "Running", nextEpisode: { date: "2026-12-01" } }), 86_400_000);
});

test("an IMDb address already in the notes wins, with no lookups", async () => {
  const boom: Fetch = async () => { throw new Error("should not fetch"); };
  const r = await enrichItem(boom, { kind: "Show", title: "Westworld (2016– )", props: {}, notes: "Set in a park.\nhttps://www.imdb.com/title/tt0475784/?ref_=nv_sr" });
  assert.equal(r.confidence, "high");
  assert.equal(r.entity?.imdb, "tt0475784");
  assert.deepEqual(splitYear("Westworld (2016– )"), { title: "Westworld", year: 2016 });
  assert.deepEqual(splitYear("Friends (1994–2004)"), { title: "Friends", year: 1994 });
});

test("list cards get no link of their own; a show's seasons don't make it a list", async () => {
  const boom: Fetch = async () => { throw new Error("should not fetch"); };
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `Row ${i}`, done: false }));
  const list = await enrichItem(boom, { kind: "Movie", title: "1001 Movies to watch", props: {}, checklists: [{ name: "Movies", rows: rows(40) }] });
  assert.equal(list.confidence, "nolink");
  assert.equal(enrichKind({ kind: "Show", checklists: [{ name: "Seasons", rows: rows(15) }] }), "show");
  assert.equal(enrichKind({ kind: "Experience" }), null);
});

test("strict back-fill skips header cards without a year and drops unsure matches", async () => {
  const boom: Fetch = async () => { throw new Error("should not fetch"); };
  assert.equal((await enrichItem(boom, { kind: "Movie", title: "Genre", props: {} }, { strict: true })).confidence, "none");
  assert.equal((await enrichItem(boom, { kind: "Book", title: "Pulitzer Prize", props: {} }, { strict: true })).confidence, "none");
  const fetch = canned([["openlibrary.org/search.json", { docs: [{ key: "/works/OL9W", title: "Something Else", author_name: ["Nobody"] }] }]]);
  assert.equal((await enrichItem(fetch, { kind: "Book", title: "Dune by Frank Herbert", props: {} }, { strict: true })).confidence, "none");
  assert.equal((await enrichItem(fetch, { kind: "Book", title: "Dune by Frank Herbert", props: {} })).confidence, "review");
});
