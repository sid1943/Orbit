import { describe, expect, it } from "vitest";
import {
  GUIDE_CLASSES,
  connectionsQuery,
  findCityQid,
  findGroup,
  groupQuery,
  normName,
  parseConnectionRows,
  parseGroupRows,
  rowMatches,
  suggestionLinks,
  type CityCenter,
} from "../src/index.js";
import { cannedFetch } from "./helpers/fetch.js";

// Made-up places around a made-up center.
const C: CityCenter = { name: "Riverton, CA", lat: 37.3, lng: -121.9 };
const E = "http://www.wikidata.org/entity/";
const NOW = Date.parse("2026-11-24T00:00:00Z");

const row = (over: Record<string, string>) => ({
  item: `${E}Q100`,
  itemLabel: "Silver Falls",
  class: `${E}Q34038`,
  loc: "Point(-121.95 37.25)",
  links: "4",
  ...over,
});

describe("groupQuery", () => {
  it("asks near classes within 30 km and far ones within 150 km", () => {
    const q = groupQuery(C, "nature");
    expect(q).toContain('wikibase:radius "30"');
    expect(q).toContain('wikibase:radius "150"');
    expect(q).toContain("wd:Q34038");
    expect(q).toContain("Point(-121.90000 37.30000)");
  });

  it("only uses its own group's classes", () => {
    const q = groupQuery(C, "food");
    expect(q).not.toContain("wd:Q34038");
    expect(q).toContain("wd:Q37654");
  });

  it("has no duplicate class within a group", () => {
    const keys = GUIDE_CLASSES.map((k) => `${k.group}:${k.qid}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("parseGroupRows", () => {
  it("makes one suggestion per place with its links and distance", () => {
    const out = parseGroupRows(
      [
        row({
          article: "https://en.wikipedia.org/wiki/Silver_Falls",
          ta: "Attraction_Review-g1-d2",
          img: "x/Silver%20Falls.jpg",
        }),
        row({ site: "https://silverfalls.example" }),
      ],
      C,
      "nature",
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      qid: "Q100",
      name: "Silver Falls",
      type: "Waterfall",
      wikipedia: "Silver Falls",
      tripadvisor: "Attraction_Review-g1-d2",
      website: "https://silverfalls.example",
      image: "Silver Falls.jpg",
      fame: 4,
    });
    expect(out[0]!.miles).toBeGreaterThan(3);
  });

  it("leaves out what is wrong: closed, no English name, too little known, no spot", () => {
    const out = parseGroupRows(
      [
        row({ item: `${E}Q1`, closed: "2019-01-01T00:00:00Z" }),
        row({ item: `${E}Q2`, itemLabel: "Q2" }),
        row({ item: `${E}Q3`, class: `${E}Q8502`, itemLabel: "Low Hill", links: "1" }),
        row({ item: `${E}Q4`, loc: "" }),
        row({ item: `${E}Q5`, itemLabel: "Open Falls" }),
      ],
      C,
      "nature",
      NOW,
    );
    expect(out.map((s) => s.qid)).toEqual(["Q5"]);
  });

  it("keeps a place whose closing date is still ahead", () => {
    expect(parseGroupRows([row({ closed: "2030-01-01T00:00:00Z" })], C, "nature", NOW)).toHaveLength(1);
  });

  it("leaves out a near-only kind found beyond 30 km", () => {
    const far = parseGroupRows(
      [row({ class: `${E}Q22698`, itemLabel: "Far Park", loc: "Point(-121.0 37.3)" })],
      C,
      "nature",
      NOW,
    );
    expect(far).toEqual([]);
  });

  it("names the type by the first class and flags World Heritage", () => {
    const out = parseGroupRows(
      [
        row({ item: `${E}Q7`, itemLabel: "Old Fort", class: `${E}Q9259` }),
        row({ item: `${E}Q7`, itemLabel: "Old Fort", class: `${E}Q57821` }),
      ],
      C,
      "culture",
      NOW,
    );
    expect(out[0]).toMatchObject({ type: "Fort", heritage: true });
  });

  it("orders by how well known, then by name", () => {
    const out = parseGroupRows(
      [
        row({ item: `${E}Q1`, itemLabel: "B Falls", links: "2" }),
        row({ item: `${E}Q2`, itemLabel: "A Falls", links: "9" }),
      ],
      C,
      "nature",
      NOW,
    );
    expect(out.map((s) => s.name)).toEqual(["A Falls", "B Falls"]);
  });
});

describe("findCityQid and findGroup", () => {
  it("read Wikidata's answers", async () => {
    const fetch = cannedFetch([
      ["query.wikidata.org", { results: { bindings: [{ item: { value: `${E}Q42` }, links: { value: "50" } }] } }],
    ]);
    expect(await findCityQid(fetch, C)).toBe("Q42");
  });

  it("returns places from a group query", async () => {
    const b = Object.fromEntries(Object.entries(row({})).map(([k, v]) => [k, { value: v }]));
    const fetch = cannedFetch([["query.wikidata.org", { results: { bindings: [b] } }]]);
    expect((await findGroup(fetch, C, "nature", NOW)).map((s) => s.name)).toEqual(["Silver Falls"]);
  });
});

describe("connections", () => {
  it("refuses a bad id", () => {
    expect(() => connectionsQuery("Q1 }")).toThrow();
  });

  it("keeps works and people, with set over filmed and the earliest year", () => {
    const out = parseConnectionRows([
      {
        item: `${E}Q10`,
        itemLabel: "Valley Story",
        how: "filmed",
        type: `${E}Q11424`,
        links: "30",
        date: "2012-05-01",
      },
      { item: `${E}Q10`, itemLabel: "Valley Story", how: "set", type: `${E}Q11424`, links: "30", date: "2011-09-01" },
      { item: `${E}Q20`, itemLabel: "A. Person", how: "born", type: `${E}Q5`, links: "40" },
      { item: `${E}Q30`, itemLabel: "Some Painting", how: "set", type: `${E}Q3305213`, links: "5" },
    ]);
    expect(out).toEqual([
      { qid: "Q20", name: "A. Person", type: "person", how: "born", fame: 40 },
      { qid: "Q10", name: "Valley Story", type: "movie", how: "set", fame: 30, year: 2011 },
    ]);
  });
});

describe("suggestionLinks", () => {
  const s = {
    qid: "Q1",
    name: "Silver Falls",
    group: "nature" as const,
    type: "Waterfall",
    lat: 37.25,
    lng: -121.95,
    miles: 4,
    fame: 3,
  };

  it("gives a map, a TripAdvisor search and no Wikipedia without an article", () => {
    expect(suggestionLinks(s, "Riverton").map((l) => l.label)).toEqual(["Map", "TripAdvisor"]);
    expect(suggestionLinks(s, "Riverton")[1]!.url).toBe(
      "https://www.tripadvisor.com/Search?q=Silver%20Falls%2C%20Riverton",
    );
  });

  it("opens the TripAdvisor page and Wikipedia when known", () => {
    const links = suggestionLinks(
      { ...s, tripadvisor: "Attraction_Review-g1-d2", wikipedia: "Silver Falls" },
      "Riverton",
    );
    expect(links.map((l) => l.url)).toEqual([
      "https://www.google.com/maps/search/?api=1&query=37.25000,-121.95000",
      "https://www.tripadvisor.com/Attraction_Review-g1-d2",
      "https://en.wikipedia.org/wiki/Silver_Falls",
    ]);
  });
});

describe("rowMatches", () => {
  it("finds a place in one of Sid's rows", () => {
    expect(rowMatches("Alum Rock Park", "Hike Alum Rock early")).toBe(true);
    expect(rowMatches("Mount Umunhum", "Hike or drive up Mt. Umunhum")).toBe(true);
    expect(rowMatches("Rosicrucian Egyptian Museum", "Rosicrucian Egyptian Museum")).toBe(true);
  });

  it("ignores the city's own name and generic words", () => {
    expect(rowMatches("Riverton Museum of Art", "Riverton Flea Market", "Riverton, CA")).toBe(false);
    expect(rowMatches("City Park", "Picnic at the park")).toBe(false);
  });

  it("matches whole words only", () => {
    expect(rowMatches("Oak Grove", "Oak Grovesville diner")).toBe(false);
  });

  it("normalises accents and abbreviations", () => {
    expect(normName("Café St. Clair & Co.")).toBe("cafe saint clair and co");
  });
});
