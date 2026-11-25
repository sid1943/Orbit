import type { Entity, Fetch, Item } from "@orbit/core";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { UPSERT_ENTITY, UPSERT_ITEM, entityRow, itemRow } from "../src/db/statements.js";
import type { Env } from "../src/env.js";
import { Budget, citiesOf, runCityGuide } from "../src/jobs/index.js";
import { testDb } from "./helpers/d1.js";

// Made-up data only.
const T0 = Date.parse("2026-11-24T12:00:00Z");
const E = "http://www.wikidata.org/entity/";
const auth = { Authorization: "Bearer t", "Content-Type": "application/json" };

let env: Env;
let calls: string[];

const b = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }]));

/** Wikidata, Overpass and Wikipedia, answering by what the query asks. */
const fakeWeb: Fetch = async (url, init) => {
  const body = decodeURIComponent(init?.body ?? "");
  calls.push(
    url.includes("wikidata")
      ? `wikidata ${/wd:Q486972/.test(body) ? "city" : /P840/.test(body) ? "works" : "group"}`
      : url.split("/")[2]!,
  );
  const json = (x: unknown) => ({ ok: true, status: 200, json: async () => x });
  if (url.includes("query.wikidata.org")) {
    if (body.includes("wd:Q486972")) return json({ results: { bindings: [b({ item: `${E}Q42`, links: "80" })] } });
    if (body.includes("P840"))
      return json({
        results: {
          bindings: [b({ item: `${E}Q70`, itemLabel: "Valley Story", how: "set", type: `${E}Q11424`, links: "30" })],
        },
      });
    if (body.includes("wd:Q34038"))
      return json({
        results: {
          bindings: [
            b({
              item: `${E}Q100`,
              itemLabel: "Silver Falls",
              class: `${E}Q34038`,
              loc: "Point(-121.95 37.25)",
              links: "4",
              article: "https://en.wikipedia.org/wiki/Silver_Falls",
            }),
            b({
              item: `${E}Q101`,
              itemLabel: "Hidden Falls",
              class: `${E}Q34038`,
              loc: "Point(-121.9 37.2)",
              links: "2",
            }),
          ],
        },
      });
    return json({ results: { bindings: [] } });
  }
  if (url.includes("overpass-api.de"))
    return json({ elements: [{ tags: { wikidata: "Q100", opening_hours: "sunrise-sunset", fee: "no" } }] });
  if (url.includes("en.wikipedia.org"))
    return json({ query: { pages: [{ title: "Silver Falls", extract: "A made-up waterfall." }] } });
  return { ok: false, status: 404, json: async () => null };
};

const place = (id: string, location: string, lat?: number, lng?: number): Entity => ({
  id,
  name: id,
  category: "city_todo",
  confidence: "map",
  location,
  ...(lat != null ? { lat, lng } : {}),
  updatedAt: 1,
});

const card = (over: Partial<Item>): Item => ({
  id: "c1",
  kind: "Place",
  title: "San Jose : Reddit Edition",
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
  checklists: [{ name: "Outdoors & Views", rows: [{ text: "Silver Falls hike after rain", done: false }] }],
  coverId: null,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

beforeEach(async () => {
  env = { API_TOKEN: "t", DB: testDb().DB };
  calls = [];
  await env.DB.batch([
    env.DB.prepare(UPSERT_ENTITY).bind(...entityRow(place("p1", "San Jose"))),
    env.DB.prepare(UPSERT_ENTITY).bind(...entityRow(place("p2", "Downtown", 37.34, -121.89))),
    env.DB.prepare(UPSERT_ITEM).bind(...itemRow(card({}))),
  ]);
});

const run = (now: number, limit = 20) => runCityGuide(env, new Budget(limit, fakeWeb), now);
const get = async (path: string) => (await app.request(path, { headers: auth }, env)).json() as Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- loose JSON in tests

describe("citiesOf", () => {
  it("finds known cities by name or nearby spot, and others with at least 3 places", () => {
    const found = citiesOf([
      { location: "San Jose", lat: null, lng: null, n: 2 },
      { location: "Somewhere", lat: 37.3, lng: -121.9, n: 1 },
      { location: "Udaipur, India", lat: 24.6, lng: 73.7, n: 3 },
      { location: "Tiny Town", lat: 10, lng: 10, n: 2 },
      { location: null, lat: null, lng: null, n: 5 },
    ]);
    expect(found.map((c) => c.name)).toEqual(["San Jose, CA", "Udaipur"]);
  });
});

describe("city rule job", () => {
  it("finds the city, then runs one step per run, then fills details", async () => {
    const r1 = await run(T0);
    expect(r1.found).toBe(1);
    expect(r1.step).toBe("San Jose, CA: city");
    let c = await get("/api/cities");
    expect(c.cities[0]).toMatchObject({ key: "san jose, ca", qid: "Q42", source: "places", working: "nature" });

    await run(T0 + 1);
    c = await get("/api/cities");
    expect(c.cities[0].counts).toEqual({ nature: 2 });

    // culture, food, experiences, connections; each run also fills details.
    for (let i = 2; i <= 5; i++) await run(T0 + i);
    c = await get("/api/cities");
    expect(c.cities[0]).toMatchObject({ working: null, doneAt: T0 + 5, counts: { nature: 2, connections: 1 } });

    const city = await get("/api/cities/san%20jose%2C%20ca");
    const falls = city.groups.nature.items;
    expect(falls.map((s: { name: string }) => s.name)).toEqual(["Silver Falls", "Hidden Falls"]);
    expect(falls[0].details).toEqual({ hours: "sunrise-sunset", fee: "no", history: "A made-up waterfall." });
    expect(falls[0].mine).toMatchObject({ itemId: "c1", checklist: 0, row: 0 });
    expect(falls[1].mine).toBeNull();
    expect(falls[0].links.map((l: { label: string }) => l.label)).toEqual(["Map", "TripAdvisor", "Wikipedia"]);
    expect(city.groups.connections.items[0]).toMatchObject({ name: "Valley Story", type: "movie", how: "set" });
    expect(city.fields).toHaveLength(12);
  });

  it("waits 90 days after a full pass and finds cities once a day", async () => {
    for (let i = 0; i <= 5; i++) await run(T0 + i);
    calls = [];
    const r = await run(T0 + 3_600_000);
    expect(r.step).toBeNull();
    expect(r.found).toBe(0);
    expect(calls).toEqual([]);
  });

  it("stops a city Wikidata doesn't know", async () => {
    const empty: Fetch = async () => ({ ok: true, status: 200, json: async () => ({ results: { bindings: [] } }) });
    const r = await runCityGuide(env, new Budget(20, empty), T0);
    expect(r.failed).toBe(1);
    const c = await get("/api/cities");
    expect(c.cities[0]).toMatchObject({ error: "not found", working: null });
  });

  it("retries a failed step later and keeps within its budget", async () => {
    await run(T0);
    const down: Fetch = async () => ({ ok: false, status: 503, json: async () => null });
    const r = await runCityGuide(env, new Budget(20, down), T0 + 1);
    expect(r.failed).toBeGreaterThan(0);
    const row = await env.DB.prepare(`SELECT step, failures, next_check FROM cities`).first<Record<string, number>>();
    expect(row).toMatchObject({ step: 1, failures: 1, next_check: T0 + 1 + 6 * 3_600_000 });
    const budget = new Budget(9, fakeWeb);
    await runCityGuide(env, budget, T0 + 7 * 3_600_000);
    expect(budget.left).toBeGreaterThanOrEqual(0);
  });

  it("does nothing without budget", async () => {
    expect(await run(T0, 2)).toMatchObject({ found: 0, step: null });
    expect(calls).toEqual([]);
  });
});

describe("cities routes", () => {
  it("adds a city by name, and refuses one it can't place", async () => {
    let res = await app.request(
      "/api/cities",
      { method: "POST", headers: auth, body: JSON.stringify({ name: "Austin" }) },
      env,
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ key: "austin, tx", name: "Austin, TX" });
    res = await app.request(
      "/api/cities",
      { method: "POST", headers: auth, body: JSON.stringify({ name: "Nowhere" }) },
      env,
    );
    expect(res.status).toBe(400);
    res = await app.request(
      "/api/cities",
      { method: "POST", headers: auth, body: JSON.stringify({ name: "Nowhere", lat: 1, lng: 2 }) },
      env,
    );
    expect(res.status).toBe(201);
    // Adding it again with a corrected center saves the new center.
    await app.request(
      "/api/cities",
      { method: "POST", headers: auth, body: JSON.stringify({ name: "Nowhere", lat: 3, lng: 4 }) },
      env,
    );
    const row = await env.DB.prepare(`SELECT lat, lng FROM cities WHERE key = 'nowhere'`).first();
    expect(row).toEqual({ lat: 3, lng: 4 });
  });

  it("hides a wrong suggestion and turns a city off", async () => {
    await run(T0);
    await run(T0 + 1);
    let res = await app.request(
      "/api/cities/san%20jose%2C%20ca/suggestions/Q101",
      { method: "PATCH", headers: auth, body: JSON.stringify({ hidden: true }) },
      env,
    );
    expect(res.status).toBe(200);
    let city = await get("/api/cities/san%20jose%2C%20ca");
    expect(city.groups.nature.items.map((s: { qid: string }) => s.qid)).toEqual(["Q100"]);
    city = await get("/api/cities/san%20jose%2C%20ca?hidden=1");
    expect(city.groups.nature.items).toHaveLength(2);

    // A later pass keeps it hidden.
    await env.DB.prepare(`UPDATE cities SET step = 1, next_check = 0`).run();
    await run(T0 + 2);
    city = await get("/api/cities/san%20jose%2C%20ca");
    expect(city.groups.nature.items).toHaveLength(1);

    // Missing from one answer and back in the next, it is still hidden.
    const onlySilver: Fetch = async (url, init) => {
      const r = await fakeWeb(url, init);
      if (!url.includes("wikidata") || !decodeURIComponent(init?.body ?? "").includes("wd:Q34038")) return r;
      const all = (await r.json()) as { results: { bindings: Record<string, { value: string }>[] } };
      const kept = all.results.bindings.filter((x) => x.item!.value.endsWith("Q100"));
      return { ok: true, status: 200, json: async () => ({ results: { bindings: kept } }) };
    };
    await env.DB.prepare(`UPDATE cities SET step = 1, next_check = 0`).run();
    await runCityGuide(env, new Budget(20, onlySilver), T0 + 2.5);
    expect(await env.DB.prepare(`SELECT hidden FROM city_suggestions WHERE qid = 'Q101'`).first()).toEqual({
      hidden: 1,
    });
    await env.DB.prepare(`UPDATE cities SET step = 1, next_check = 0`).run();
    await run(T0 + 2.7);
    expect(await env.DB.prepare(`SELECT hidden FROM city_suggestions WHERE qid = 'Q101'`).first()).toEqual({
      hidden: 1,
    });

    res = await app.request(
      "/api/cities/san%20jose%2C%20ca",
      { method: "PATCH", headers: auth, body: JSON.stringify({ off: true }) },
      env,
    );
    expect(res.status).toBe(200);
    calls = [];
    await run(T0 + 3);
    expect(calls.filter((c) => c.startsWith("wikidata"))).toEqual([]);
    expect((await get("/api/cities/nope")).error).toBe("not found");
  });
});
