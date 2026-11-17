import { describe, expect, it } from "vitest";
import {
  connectionsFor,
  hasConnections,
  parseOrd,
  parseRelationRows,
  parseWorkRows,
  qidsByExternalId,
  relationsNeeded,
  relationsOf,
  seriesMembers,
  workType,
  type Fetch,
  type Relation,
  type Work,
} from "../src/index.js";

// Made-up things only.
const E = (q: string) => `http://www.wikidata.org/entity/${q}`;
const sparqlJson = (rows: Record<string, string>[]) => ({
  results: { bindings: rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { value: v }]))) },
});

/** Answers every query with the rows of the first route whose text appears in the query. */
function sparqlFetch(routes: [queryPart: string, rows: Record<string, string>[]][]): Fetch & { queries: string[] } {
  const queries: string[] = [];
  const f = (async (_url, init) => {
    const q = decodeURIComponent((init?.body ?? "").replace(/^query=/, ""));
    queries.push(q);
    const hit = routes.find(([part]) => q.includes(part));
    return { ok: true, status: 200, json: async () => sparqlJson(hit?.[1] ?? []) };
  }) as Fetch & { queries: string[] };
  f.queries = queries;
  return f;
}

describe("parseOrd", () => {
  it("reads plain positions only", () => {
    expect(parseOrd("3")).toBe(3);
    expect(parseOrd(" 1.5 ")).toBe(1.5);
    expect(parseOrd("Book Two")).toBeUndefined();
    expect(parseOrd(undefined)).toBeUndefined();
  });
});

describe("workType", () => {
  it("puts series before the things in them", () => {
    expect(workType(["Q24856", "Q11424"])).toBe("series");
    expect(workType(["Q11424"])).toBe("movie");
    expect(workType(["Q8261"])).toBe("book");
    expect(workType(["Q7889"])).toBe("game");
    expect(workType(["Q5398426"])).toBe("show");
    expect(workType(["Q196600"])).toBe("franchise");
    expect(workType(["Q5"])).toBe("other");
  });
});

describe("parseRelationRows", () => {
  it("stores every connection in one direction and keeps series positions", () => {
    const rels = parseRelationRows([
      { item: E("Q1"), rel: "series", other: E("Q100"), ord: "2" },
      { item: E("Q1"), rel: "follows", other: E("Q0") },
      { item: E("Q1"), rel: "followed_by", other: E("Q2") },
      { item: E("Q1"), rel: "adapted_as", other: E("Q50") },
      { item: E("Q1"), rel: "based_on", other: E("Q60") },
      { item: E("Q1"), rel: "franchise", other: E("Q200") },
      { item: E("Q1"), rel: "follows", other: E("Q0") },
      { item: E("Q1"), rel: "follows", other: E("Q1") },
    ]);
    expect(rels).toEqual([
      { from: "Q1", rel: "series", to: "Q100", ord: 2 },
      { from: "Q1", rel: "follows", to: "Q0" },
      { from: "Q2", rel: "follows", to: "Q1" },
      { from: "Q50", rel: "based_on", to: "Q1" },
      { from: "Q1", rel: "based_on", to: "Q60" },
      { from: "Q1", rel: "franchise", to: "Q200" },
    ]);
  });

  it("caps long lists of one kind", () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ item: E("Q1"), rel: "adapted_as", other: E(`Q${1000 + i}`) }));
    expect(parseRelationRows(rows)).toHaveLength(40);
  });
});

describe("parseWorkRows", () => {
  it("reads names, types, years and ids", () => {
    expect(
      parseWorkRows([
        {
          w: E("Q1"),
          label: "Sand Planet",
          types: `${E("Q8261")} ${E("Q5")}`,
          year: "1971",
          ol: "OL1W",
          author: "Ada Example",
        },
        { w: E("Q2"), types: "" },
      ]),
    ).toEqual([
      { qid: "Q1", label: "Sand Planet", type: "book", year: 1971, openLibrary: "OL1W", author: "Ada Example" },
      { qid: "Q2", label: "Q2", type: "other" },
    ]);
  });
});

describe("qidsByExternalId", () => {
  it("keeps only ids that point at exactly one thing", async () => {
    const f = sparqlFetch([
      [
        "P648",
        [
          { item: E("Q1"), id: "OL1W" },
          { item: E("Q2"), id: "OL2W" },
          { item: E("Q3"), id: "OL2W" },
        ],
      ],
    ]);
    const map = await qidsByExternalId(f, "P648", ["OL1W", "OL2W", "OL3W"]);
    expect([...map]).toEqual([["OL1W", "Q1"]]);
    expect(f.queries[0]).toContain('"OL1W" "OL2W" "OL3W"');
  });

  it("sends nothing for an empty list", async () => {
    const f = sparqlFetch([]);
    expect((await qidsByExternalId(f, "P345", [])).size).toBe(0);
    expect(f.queries).toHaveLength(0);
  });
});

describe("relationsOf and seriesMembers", () => {
  it("asks Wikidata about the given ids and reads the answer", async () => {
    const f = sparqlFetch([
      [
        "p:P179 ?st . ?st ps:P179 ?other . OPTIONAL { ?st pq:P1545 ?ord } BIND",
        [{ item: E("Q1"), rel: "follows", other: E("Q0") }],
      ],
      [
        "VALUES ?other",
        [
          { item: E("Q1"), other: E("Q100"), ord: "1" },
          { item: E("Q2"), other: E("Q100"), ord: "2" },
        ],
      ],
    ]);
    expect(await relationsOf(f, ["Q1"])).toEqual([{ from: "Q1", rel: "follows", to: "Q0" }]);
    expect(f.queries[0]).toContain("wd:Q1");
    expect(await seriesMembers(f, ["Q100"])).toEqual([
      { from: "Q1", rel: "series", to: "Q100", ord: 1 },
      { from: "Q2", rel: "series", to: "Q100", ord: 2 },
    ]);
  });
});

describe("connectionsFor", () => {
  const work = (qid: string, label: string, type: Work["type"], year?: number): [string, Work] => [
    qid,
    { qid, label, type, ...(year ? { year } : {}) },
  ];
  const works = new Map([
    work("Q1", "Sand Planet", "book", 1971),
    work("Q2", "Sand Messiah", "book", 1974),
    work("Q3", "Sand Children", "book", 1978),
    work("Q9", "Sand Audio Set", "other"),
    work("Q100", "Sand", "series"),
    work("Q101", "Sand Saga", "other"),
    work("Q50", "Sand Planet", "movie", 1990),
    work("Q51", "Sand Planet: Part Two", "movie", 1993),
    work("Q52", "Episode 4", "other", 1995),
    work("Q53", "Q53", "movie", 1996),
    work("Q200", "Sand", "franchise"),
  ]);
  const relations: Relation[] = [
    { from: "Q1", rel: "series", to: "Q100", ord: 1 },
    { from: "Q3", rel: "series", to: "Q100", ord: 3 },
    { from: "Q2", rel: "series", to: "Q100", ord: 2 },
    { from: "Q9", rel: "series", to: "Q100" },
    // A second Wikidata item for the same series.
    { from: "Q1", rel: "series", to: "Q101" },
    { from: "Q2", rel: "series", to: "Q101" },
    { from: "Q3", rel: "series", to: "Q101" },
    { from: "Q2", rel: "follows", to: "Q1" },
    { from: "Q50", rel: "based_on", to: "Q1" },
    { from: "Q51", rel: "based_on", to: "Q1" },
    // An episode "based on" the book, and a movie with no name: left out.
    { from: "Q52", rel: "based_on", to: "Q1" },
    { from: "Q53", rel: "based_on", to: "Q1" },
    { from: "Q1", rel: "franchise", to: "Q200" },
    { from: "Q51", rel: "follows", to: "Q50" },
  ];
  const inOrbit = new Map([
    ["Q1", [{ itemId: "it1", title: "Sand Planet", status: "done" }]],
    ["Q50", [{ itemId: "it2", title: "Sand Planet (1990)", status: "todo" }]],
  ]);

  it("shows the series in order with where this one sits and what's next", () => {
    const c = connectionsFor("Q1", relations, works, inOrbit);
    expect(c.series).toHaveLength(1);
    const s = c.series[0]!;
    expect(s.series.label).toBe("Sand");
    expect(s.members.map((m) => m.label)).toEqual(["Sand Planet", "Sand Messiah", "Sand Children"]);
    expect(s.position).toBe(1);
    expect(s.next?.label).toBe("Sand Messiah");
    expect(s.members[0]!.inOrbit).toEqual([{ itemId: "it1", title: "Sand Planet", status: "done" }]);
    expect(s.members[1]!.inOrbit).toEqual([]);
  });

  it("lists sequels, adaptations and franchises, marking the ones in Orbit", () => {
    const c = connectionsFor("Q1", relations, works, inOrbit);
    expect(c.followedBy.map((w) => w.qid)).toEqual(["Q2"]);
    expect(c.follows).toEqual([]);
    expect(c.adaptations.map((w) => [w.label, w.inOrbit.length])).toEqual([
      ["Sand Planet", 1],
      ["Sand Planet: Part Two", 0],
    ]);
    expect(c.franchises.map((f) => f.label)).toEqual(["Sand"]);
    expect(hasConnections(c)).toBe(true);
  });

  it("works from the movie's side too", () => {
    const c = connectionsFor("Q50", relations, works, inOrbit);
    expect(c.basedOn.map((w) => w.label)).toEqual(["Sand Planet"]);
    expect(c.followedBy.map((w) => w.label)).toEqual(["Sand Planet: Part Two"]);
    expect(c.series).toEqual([]);
  });

  it("is empty for a thing with no connections", () => {
    const c = connectionsFor("Q999", relations, works, inOrbit);
    expect(hasConnections(c)).toBe(false);
  });

  it("keeps only what a card needs", () => {
    const needed = relationsNeeded("Q50", relations);
    expect(needed.map((r) => `${r.from}>${r.to}`)).toEqual(["Q50>Q1", "Q51>Q50"]);
  });
});
