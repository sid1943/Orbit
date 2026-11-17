import { describe, expect, it } from "vitest";
import { DAY, afterCheck, hasPassed, ownerState, watchRule, type Entity } from "../src/index.js";

// Made-up linked things only.
const NOW = Date.parse("2026-11-17T12:00:00Z");
const thing = (over: Partial<Entity> = {}): Entity => ({
  id: "e1",
  name: "Harbor Lights",
  category: "movie",
  confidence: "high",
  updatedAt: 1,
  ...over,
});
const open = { status: "todo", archived: false, deleted: false };

describe("ownerState", () => {
  it("lets the liveliest card or row win", () => {
    expect(ownerState([])).toBe("gone");
    expect(ownerState([{ ...open, archived: true }])).toBe("gone");
    expect(ownerState([{ ...open, status: "dropped" }])).toBe("dropped");
    expect(
      ownerState([
        { ...open, rowDone: true },
        { ...open, status: "dropped" },
      ]),
    ).toBe("done");
    expect(
      ownerState([
        { ...open, rowDone: true },
        { ...open, rowDone: false },
      ]),
    ).toBe("open");
  });
});

describe("watchRule", () => {
  it("watches a confirmed show on TVmaze by its IMDb id, even once Sid finished it", () => {
    const show = thing({ category: "show", imdb: "tt0000001" });
    expect(watchRule(show, "open", NOW)).toEqual({ what: "tv", source: "tvmaze", key: "tt0000001", stop: null });
    expect(watchRule(show, "done", NOW).stop).toBeNull();
    expect(watchRule(show, "dropped", NOW).stop).toBe("dropped");
    expect(watchRule(thing({ category: "show" }), "open", NOW).stop).toBe("no-source");
  });

  it("only watches sure links", () => {
    expect(watchRule(thing({ category: "show", imdb: "tt1", confidence: "review" }), "open", NOW).stop).toBe(
      "not-linked",
    );
    expect(watchRule(thing({ qid: "Q1", year: 2027, confidence: "user" }), "open", NOW).stop).toBeNull();
  });

  it("watches release dates only for movies and games that may not be out", () => {
    expect(watchRule(thing({ qid: "Q1", year: 1999 }), "open", NOW).stop).toBe("released");
    expect(watchRule(thing({ qid: "Q1", year: 2026 }), "open", NOW)).toEqual({
      what: "release",
      source: "wikidata",
      key: "Q1",
      stop: null,
    });
    expect(watchRule(thing({ category: "game", qid: "Q2" }), "open", NOW).source).toBe("wikidata");
    expect(watchRule(thing({ qid: "Q1", year: 2027 }), "done", NOW).stop).toBe("done");
    expect(watchRule(thing({ year: 2027 }), "open", NOW).stop).toBe("no-source");
  });

  it("watches books not yet out on Open Library, falling back to Wikidata", () => {
    const book = thing({ category: "book", openLibrary: "OL1W", year: 2027 });
    expect(watchRule(book, "open", NOW)).toEqual({ what: "publish", source: "openlibrary", key: "OL1W", stop: null });
    expect(watchRule({ ...book, openLibrary: undefined, qid: "Q3" }, "open", NOW).source).toBe("wikidata");
    expect(watchRule({ ...book, year: 2001 }, "open", NOW).stop).toBe("published");
  });

  it("watches places that can close, until visited or closed", () => {
    const cafe = thing({ category: "eatery", qid: "Q4" });
    expect(watchRule(cafe, "open", NOW)).toEqual({ what: "closure", source: "wikidata", key: "Q4", stop: null });
    expect(watchRule(cafe, "done", NOW).stop).toBe("done");
    expect(watchRule({ ...cafe, closed: "2020" }, "open", NOW).stop).toBe("closed");
    expect(watchRule({ ...cafe, qid: undefined }, "open", NOW).stop).toBe("no-source");
  });

  it("stops at once for things that don't change, and for things no card points at", () => {
    expect(watchRule(thing({ category: "natural_place", qid: "Q5" }), "open", NOW)).toEqual({
      what: "none",
      source: null,
      key: null,
      stop: "nothing-to-watch",
    });
    expect(watchRule(thing({ category: "show", imdb: "tt1" }), "gone", NOW).stop).toBe("removed");
  });
});

describe("afterCheck", () => {
  const found = (f: object) => ({ found: { source: "tvmaze" as const, checkedAt: NOW, ...f } });

  it("looks the day after an episode airs, at least weekly and at most daily", () => {
    expect(afterCheck("tv", found({ nextEpisode: { date: "2026-11-19" } }), 0, NOW).next).toBe(NOW + 2.5 * DAY);
    expect(afterCheck("tv", found({ nextEpisode: { date: "2027-03-01" } }), 0, NOW).next).toBe(NOW + 7 * DAY);
    expect(afterCheck("tv", found({ nextEpisode: { date: "2026-11-17" } }), 0, NOW).next).toBe(NOW + DAY);
    expect(afterCheck("tv", found({ status: "Running" }), 0, NOW).next).toBe(NOW + 3 * DAY);
  });

  it("stops a show that ended over a year ago, and checks a recently ended one monthly", () => {
    expect(afterCheck("tv", found({ status: "Ended", lastEpisode: { date: "2019-05-01" } }), 0, NOW).stop).toBe(
      "ended",
    );
    expect(afterCheck("tv", found({ status: "Ended", lastEpisode: { date: "2026-09-01" } }), 0, NOW).next).toBe(
      NOW + 30 * DAY,
    );
  });

  it("stops once released, and looks weekly when the date is near", () => {
    expect(afterCheck("release", found({ releaseDate: "2026-11-01" }), 0, NOW).stop).toBe("released");
    expect(afterCheck("publish", found({ releaseDate: "2025" }), 0, NOW).stop).toBe("published");
    expect(afterCheck("release", found({ releaseDate: "2026-12-20" }), 0, NOW).next).toBe(NOW + 7 * DAY);
    expect(afterCheck("release", found({ releaseDate: "2028-01-01" }), 0, NOW).next).toBe(NOW + 30 * DAY);
    expect(afterCheck("release", found({}), 0, NOW).next).toBe(NOW + 30 * DAY);
  });

  it("stops a closed place and checks open ones every 90 days", () => {
    expect(afterCheck("closure", found({ closed: "2024-02-01" }), 0, NOW).stop).toBe("closed");
    expect(afterCheck("closure", found({}), 0, NOW).next).toBe(NOW + 90 * DAY);
  });

  it("retries errors in 6 hours without counting them, and gives up after three unknowns", () => {
    expect(afterCheck("tv", { error: "timeout" }, 2, NOW)).toEqual({
      next: NOW + 6 * 3_600_000,
      stop: null,
      misses: 2,
    });
    expect(afterCheck("tv", { unknown: true }, 0, NOW)).toEqual({ next: NOW + 30 * DAY, stop: null, misses: 1 });
    expect(afterCheck("tv", { unknown: true }, 2, NOW)).toEqual({ next: null, stop: "unknown-at-source", misses: 3 });
  });
});

describe("hasPassed", () => {
  it("treats a month or a year as passed only once it is over", () => {
    expect(hasPassed("2026-11-17", NOW)).toBe(true);
    expect(hasPassed("2026-11", NOW)).toBe(false);
    expect(hasPassed("2026-10", NOW)).toBe(true);
    expect(hasPassed("2026", NOW)).toBe(false);
    expect(hasPassed("2025", NOW)).toBe(true);
  });
});
