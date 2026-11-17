import { test } from "vitest";
import assert from "node:assert/strict";
import { matcher, readableLink, slug } from "../src/text.js";
import { entityLinks } from "../src/links.js";
import { importOrbitExport } from "../src/importExport.js";

test("search matches word starts, not the middle of words", () => {
  const m = matcher("ace");
  assert.equal(m("Ace Combat 3"), true);
  assert.equal(m("Smokin' Aces"), true);
  assert.equal(m("Poker Face"), false);
  assert.equal(matcher("new york ")("New York Public Library"), true);
  assert.equal(matcher("new york ")("newer yorkshire"), false);
});

test("links get readable names", () => {
  assert.equal(readableLink("https://www.reddit.com/r/books/comments/abc/the_best_list/").label, "Reddit r/books: The Best List");
  assert.equal(readableLink("https://www.imdb.com/title/tt0111161/").label, "IMDb page");
  assert.equal(readableLink("https://example.com/x", "My link").label, "My link");
  assert.equal(slug("The Complete Robot - By Issac Asimov"), "the-complete-robot-by-issac-asimov");
});

test("one standard link per kind", () => {
  const movie = entityLinks({ id: "e", name: "Se7en", category: "movie", confidence: "high", imdb: "tt0114369", updatedAt: 0 });
  assert.deepEqual(movie.map((l) => l.label), ["IMDb"]);
  const place = entityLinks({ id: "p", name: "Mahar Point", category: "natural_place", confidence: "map", mapQuery: "Mahar Point, Maine, USA", updatedAt: 0 });
  assert.deepEqual(place.map((l) => l.label), ["Map"]);
});

test("imports an Orbit export file", () => {
  const r = importOrbitExport({
    format: "orbit-export", version: 1, exported: "2026-11-17",
    items: [{ id: "a", t: "Run a 10K", k: "Health", s: "todo", cl: [{ n: "Season", i: [["Season 1", 1, null, "e1"]] }], due: "2026-12-01T00:00:00Z" }],
    ent: { e1: { n: "Dune", cat: "book", conf: "high", ol: "OL893415W", yr: 1965 } },
    reviews: { e1: "yes", e2: { d: "fix", url: "https://x.y", add: true }, e3: "junk", e4: { d: "yes", at: 5, guess_q: "Q1" } },
  });
  assert.equal(r.items[0]?.kind, "To-do");
  assert.equal(r.items[0]?.due, "2026-12-01");
  assert.equal(r.items[0]?.checklists[0]?.rows[0]?.entityId, "e1");
  assert.equal(r.entities[0]?.openLibrary, "OL893415W");
  assert.equal(r.reviews.length, 3);
  assert.equal(r.reviews[2]?.at, 5);
  assert.throws(() => importOrbitExport({ format: "other" }));
});
