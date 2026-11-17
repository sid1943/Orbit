import { describe, expect, it } from "vitest";
import {
  nextCheckAfter,
  openLibraryPublished,
  publishDate,
  tvmazeStatus,
  wikidataDates,
  type Fetch,
} from "../src/index.js";
import { cannedFetch, noFetch } from "./helpers/fetch.js";

describe("nextCheckAfter", () => {
  it("checks running shows more often than ended ones", () => {
    expect(nextCheckAfter({ status: "Running", nextEpisode: null })).toBeLessThan(
      nextCheckAfter({ status: "Ended", nextEpisode: null }),
    );
  });

  it("checks daily when an episode is coming", () => {
    expect(nextCheckAfter({ status: "Running", nextEpisode: { date: "2026-12-01" } })).toBe(86_400_000);
  });
});

describe("tvmazeStatus", () => {
  it("skips the IMDb lookup when the TVmaze id is known", async () => {
    const urls: string[] = [];
    const fetch: Fetch = async (url) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => ({ id: 7, status: "Running", _embedded: { seasons: [] } }) };
    };
    const r = await tvmazeStatus(fetch, "tt0000001", Date.parse("2026-11-17"), 7);
    expect(urls).toEqual([expect.stringContaining("/shows/7?")]);
    expect(r?.tvmazeId).toBe(7);
    expect(r?.live.status).toBe("Running");
  });
});

describe("wikidataDates", () => {
  it("asks once for many ids and reads the earliest release and closing dates", async () => {
    const urls: string[] = [];
    const fetch: Fetch = async (url) => {
      urls.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          results: {
            bindings: [
              {
                item: { value: "http://www.wikidata.org/entity/Q1" },
                released: { value: "2027-05-01T00:00:00Z" },
              },
              { item: { value: "http://www.wikidata.org/entity/Q2" }, closed: { value: "2023-01-31T00:00:00Z" } },
              { item: { value: "http://www.wikidata.org/entity/Q3" } },
            ],
          },
        }),
      };
    };
    const r = await wikidataDates(fetch, ["Q1", "Q2", "Q3", "Q1", "bad"]);
    expect(urls).toHaveLength(1);
    expect(decodeURIComponent(urls[0]!)).toContain("wd:Q1 wd:Q2 wd:Q3 }");
    expect(Object.fromEntries(r)).toEqual({ Q1: { released: "2027-05-01" }, Q2: { closed: "2023-01-31" }, Q3: {} });
  });

  it("asks nothing for no ids", async () => {
    expect((await wikidataDates(noFetch, [])).size).toBe(0);
  });
});

describe("publishDate and openLibraryPublished", () => {
  it("reads Open Library's free-text dates", () => {
    expect(publishDate("March 4, 2027")).toBe("2027-03-04");
    expect(publishDate("2027-03-04")).toBe("2027-03-04");
    expect(publishDate("Sep 2027")).toBe("2027-09");
    expect(publishDate("2027")).toBe("2027");
    expect(publishDate("someday")).toBeUndefined();
  });

  it("returns null when Open Library doesn't know the work", async () => {
    expect(await openLibraryPublished(cannedFetch([]), "OL1W")).toBeNull();
    expect(
      await openLibraryPublished(cannedFetch([["/works/OL2W.json", { first_publish_date: "2027" }]]), "OL2W"),
    ).toEqual({ releaseDate: "2027" });
  });
});
