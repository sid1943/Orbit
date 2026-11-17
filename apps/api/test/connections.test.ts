import type { Connections, Entity, Item } from "@orbit/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { UPSERT_ENTITY, UPSERT_ITEM, entityRow, itemRow } from "../src/db/statements.js";
import type { Env } from "../src/env.js";
import { RECONNECT_AFTER, connectWorks } from "../src/jobs/connect-works.js";
import { testDb } from "./helpers/d1.js";

// Made-up data only.
const card = (over: Partial<Item> = {}): Item => ({
  id: "it1",
  kind: "Book",
  title: "Sand Planet",
  status: "todo",
  tags: [],
  source: "Added in Orbit",
  props: {},
  notes: "",
  due: null,
  start: null,
  archived: false,
  deleted: false,
  entityId: null,
  refs: [],
  links: [],
  attachments: [],
  comments: [],
  checklists: [],
  coverId: null,
  createdAt: 1,
  updatedAt: 100,
  ...over,
});
const thing = (over: Partial<Entity> = {}): Entity => ({
  id: "e1",
  name: "Sand Planet",
  category: "book",
  confidence: "high",
  updatedAt: 100,
  ...over,
});

const E = (q: string) => `http://www.wikidata.org/entity/${q}`;
const rows = (list: Record<string, string>[]) =>
  Response.json({
    results: { bindings: list.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { value: v }]))) },
  });

/** A made-up Wikidata: a three-book series, a movie of book 1, and one more book with no Wikidata id. */
function fakeWikidata() {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const q = decodeURIComponent(String(init?.body ?? "").replace(/^query=/, ""));
    // The names query mentions every id property, so it goes first.
    if (q.includes("VALUES ?w"))
      return rows(
        [
          ["Q1", "Sand Planet", "Q8261"],
          ["Q2", "Sand Messiah", "Q8261"],
          ["Q3", "Sand Children", "Q8261"],
          ["Q50", "Sand Planet", "Q11424"],
          ["Q100", "Sand", "Q277759"],
        ]
          .filter(([qid]) => q.includes(`wd:${qid} `) || q.includes(`wd:${qid} }`))
          .map(([qid, label, type]) => ({ w: E(qid!), label: label!, types: E(type!) })),
      );
    if (q.includes("wdt:P648")) return rows([{ item: E("Q1"), id: "OL1W" }]);
    if (q.includes("wdt:P345 ?id")) return rows([]);
    if (q.includes("VALUES ?item"))
      return rows([
        { item: E("Q1"), rel: "series", other: E("Q100"), ord: "1" },
        { item: E("Q1"), rel: "adapted_as", other: E("Q50") },
        { item: E("Q1"), rel: "followed_by", other: E("Q2") },
      ]);
    if (q.includes("VALUES ?other"))
      return rows([
        { item: E("Q1"), other: E("Q100"), ord: "1" },
        { item: E("Q2"), other: E("Q100"), ord: "2" },
        { item: E("Q3"), other: E("Q100"), ord: "3" },
      ]);
    return new Response("", { status: 500 });
  });
}

let env: Env;
const auth = { Authorization: "Bearer t" };

beforeEach(async () => {
  env = { API_TOKEN: "t", DB: testDb().DB };
  vi.stubGlobal("fetch", fakeWikidata());
  await env.DB.batch([
    env.DB.prepare(UPSERT_ITEM).bind(...itemRow(card({ id: "it1", entityId: "e1" }))),
    env.DB.prepare(UPSERT_ITEM).bind(
      ...itemRow(card({ id: "it2", kind: "Movie", title: "Sand Planet (1990)", entityId: "e2" })),
    ),
    env.DB.prepare(UPSERT_ITEM).bind(...itemRow(card({ id: "it3", title: "Lost Book", entityId: "e3" }))),
    env.DB.prepare(UPSERT_ENTITY).bind(...entityRow(thing({ id: "e1", openLibrary: "OL1W" }))),
    env.DB.prepare(UPSERT_ENTITY).bind(
      ...entityRow(thing({ id: "e2", category: "movie", qid: "Q50", imdb: "tt0000050" })),
    ),
    env.DB.prepare(UPSERT_ENTITY).bind(...entityRow(thing({ id: "e3", openLibrary: "OL9W" }))),
    // Unsure links are left alone.
    env.DB.prepare(UPSERT_ENTITY).bind(...entityRow(thing({ id: "e4", confidence: "review", openLibrary: "OL4W" }))),
  ]);
});
afterEach(() => vi.unstubAllGlobals());

describe("connectWorks", () => {
  it("finds missing Wikidata ids, then reads connections and names", async () => {
    const r = await connectWorks(env, 1000);
    expect(r).toMatchObject({ mapped: 1, connected: 2, failed: 0 });
    const e1 = await env.DB.prepare("SELECT data FROM entities WHERE id = 'e1'").first<{ data: string }>();
    expect(JSON.parse(e1!.data).qid).toBe("Q1");
    const state = await env.DB.prepare(
      "SELECT entity_id, status, next_check FROM connect_state ORDER BY entity_id",
    ).all<{
      entity_id: string;
      status: string;
      next_check: number;
    }>();
    expect(state.results.map((s) => [s.entity_id, s.status])).toEqual([
      ["e1", "connected"],
      ["e2", "connected"],
      ["e3", "no-qid"],
    ]);
    expect(state.results[0]!.next_check).toBe(1000 + RECONNECT_AFTER);
  });

  it("has nothing to do until things are due again", async () => {
    await connectWorks(env, 1000);
    expect(await connectWorks(env, 2000)).toMatchObject({ mapped: 0, connected: 0 });
  });

  it("tries again later when Wikidata fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 503 })),
    );
    const r = await connectWorks(env, 1000);
    expect(r.failed).toBeGreaterThan(0);
    expect(r.connected).toBe(0);
  });
});

describe("GET /api/connections/:itemId", () => {
  const get = async (path: string) => {
    const res = await app.request(path, { headers: auth }, env);
    return (await res.json()) as { connections: Connections | null };
  };

  it("shows the series, what's next and the movie made from the book", async () => {
    await connectWorks(env, 1000);
    const { connections: c } = await get("/api/connections/it1");
    expect(c?.series[0]?.members.map((m) => m.label)).toEqual(["Sand Planet", "Sand Messiah", "Sand Children"]);
    expect(c?.series[0]?.position).toBe(1);
    expect(c?.series[0]?.next?.label).toBe("Sand Messiah");
    expect(c?.adaptations.map((a) => [a.label, a.inOrbit.map((o) => o.itemId)])).toEqual([["Sand Planet", ["it2"]]]);
    const movie = await get("/api/connections/it2");
    expect(movie.connections?.basedOn.map((b) => b.inOrbit[0]?.itemId)).toEqual(["it1"]);
  });

  it("is null for a card without a Wikidata id", async () => {
    expect((await get("/api/connections/it3")).connections).toBeNull();
  });

  it("reports progress", async () => {
    await connectWorks(env, 1000);
    const res = await app.request("/api/connections/progress", { headers: auth }, env);
    expect(await res.json()).toMatchObject({ total: 3, withQid: 2, connected: 2, noQid: 1 });
  });
});
