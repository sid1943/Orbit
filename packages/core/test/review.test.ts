import { describe, expect, it } from "vitest";
import { applyReview, cardKey, guessFields, hiddenKey, hiddenUrls, userLinksFor, type Entity } from "../src/index.js";

// Made-up examples only.
const guessed: Entity = {
  id: "e1",
  name: "Harbor Lights",
  category: "movie",
  confidence: "review",
  location: "Somewhere",
  // Guesses from the old Orbit keep the export's short keys.
  candidate: { q: "Q100", label: "Harbor Lights (1999)", imdb: "tt0000001", yr: 1999 } as Partial<Entity>,
  alternatives: [{ qid: "Q200", label: "Harbor Lights (2010)", imdb: "tt0000002" }],
  updatedAt: 5,
};

describe("guessFields", () => {
  it("reads short and long keys", () => {
    expect(guessFields({ q: "Q1", wp: "Page", lat: 1 } as Partial<Entity>)).toEqual({
      qid: "Q1",
      wikipedia: "Page",
      lat: 1,
    });
    expect(guessFields({ qid: "Q2", openLibrary: "OL1W" })).toEqual({ qid: "Q2", openLibrary: "OL1W" });
    expect(guessFields(null)).toEqual({});
  });
});

describe("applyReview", () => {
  it("leaves the thing alone without an answer", () => {
    expect(applyReview(guessed, undefined)).toBe(guessed);
  });

  it("takes the guess on yes and keeps the name", () => {
    const e = applyReview(guessed, { d: "yes" });
    expect(e).toMatchObject({ name: "Harbor Lights", qid: "Q100", imdb: "tt0000001", year: 1999 });
    expect(e).toMatchObject({ confidence: "high", reviewed: "yes", location: "Somewhere" });
  });

  it("drops the links of a wrong guess", () => {
    const e = applyReview({ ...guessed, imdb: "tt0000001", lat: 1, lng: 2 }, { d: "no" });
    expect(e).toMatchObject({ confidence: "rejected", reviewed: "no", name: "Harbor Lights" });
    expect(e.imdb).toBeUndefined();
    expect(e.lat).toBeUndefined();
    expect(e.candidate).toBeUndefined();
  });

  it("marks no link needed", () => {
    const e = applyReview({ ...guessed, mapQuery: "x" }, { d: "none" });
    expect(e).toMatchObject({ confidence: "nolink", reviewed: "none" });
    expect(e.mapQuery).toBeUndefined();
  });

  it("picks an alternative, or keeps the id when it isn't listed", () => {
    expect(applyReview(guessed, { d: "alt", qid: "Q200" })).toMatchObject({
      qid: "Q200",
      imdb: "tt0000002",
      confidence: "high",
      reviewed: "alt",
    });
    const other = applyReview(guessed, { d: "alt", qid: "Q300", label: "Other" });
    expect(other).toMatchObject({ qid: "Q300", label: "Other", confidence: "high" });
    expect(other.imdb).toBeUndefined();
  });

  it("replaces the links with Sid's own, or adds them", () => {
    const fixed = applyReview(guessed, { d: "fix", url: "https://example.com/page", add: false });
    expect(fixed).toMatchObject({ confidence: "user", reviewed: "fix" });
    expect(fixed.userLinks).toEqual([{ label: expect.any(String), url: "https://example.com/page" }]);
    expect(fixed.qid).toBeUndefined();
    const added = applyReview({ ...guessed, confidence: "high", qid: "Q100" }, { d: "fix", text: "Pier", add: true });
    expect(added).toMatchObject({ confidence: "high", qid: "Q100", reviewed: "fix" });
  });
});

describe("userLinksFor", () => {
  it("adds a map search only for places", () => {
    expect(userLinksFor({ category: "museum", location: "Town" }, { text: "Old Mill" }).map((l) => l.label)).toEqual([
      "Search",
      "Map",
    ]);
    expect(userLinksFor({ category: "movie" }, { text: "Old Mill" }).map((l) => l.label)).toEqual(["Search"]);
  });

  it("ignores text that isn't a web address", () => {
    expect(userLinksFor({ category: "movie" }, { url: "not-a-link https://example.org/x" })).toHaveLength(1);
  });
});

describe("review keys", () => {
  it("names card and hidden-link keys like Orbit today", () => {
    expect(cardKey("it1")).toBe("card-it1");
    expect(hiddenKey("e1")).toBe("x:e1");
    expect([...hiddenUrls({ d: "hide", urls: ["https://a.example"] })]).toEqual(["https://a.example"]);
    expect(hiddenUrls({ d: "yes" }).size).toBe(0);
  });
});
