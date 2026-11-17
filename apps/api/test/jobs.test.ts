import type { Entity, Fetch, Item } from "@orbit/core";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { UPSERT_ENTITY, UPSERT_ITEM, entityRow, itemRow } from "../src/db/statements.js";
import type { Env } from "../src/env.js";
import { Budget, runScheduledJobs } from "../src/jobs/index.js";
import { testDb } from "./helpers/d1.js";

// Made-up data only.
const DAY = 86_400_000;
const T0 = Date.parse("2026-11-17T12:00:00Z");

const card = (over: Partial<Item> = {}): Item => ({
  id: "c1",
  kind: "Show",
  title: "Harbor Lights",
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
const thing = (over: Partial<Entity>): Entity => ({
  id: "e1",
  name: "Harbor Lights",
  category: "show",
  confidence: "high",
  updatedAt: 100,
  ...over,
});

let env: Env;
let calls: string[];

/** Answers like TVmaze, Wikidata and a few made-up sites. */
const fakeWeb: Fetch = async (url, init) => {
  calls.push(`${init?.method ?? "GET"} ${url}`);
  const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
  if (url.includes("tvmaze.com/lookup/shows")) return json({ id: 42 });
  if (url.includes("tvmaze.com/shows/42"))
    return json({
      id: 42,
      status: "Running",
      image: { medium: "https://static.tvmaze.example/42.jpg" },
      _embedded: { nextepisode: { airdate: "2026-11-20", season: 2, number: 3 }, seasons: [] },
    });
  if (url.includes("query.wikidata.org"))
    return json({
      results: {
        bindings: [
          { item: { value: "http://www.wikidata.org/entity/Q10" }, released: { value: "2027-06-01T00:00:00Z" } },
        ],
      },
    });
  if (url.startsWith("https://ok.example")) return json(null, 200);
  if (url.startsWith("https://gone.example")) return json(null, 404);
  return json(null, 404);
};
const run = (now: number, limit = 48) => runScheduledJobs(env, now, new Budget(limit, fakeWeb));
const rows = async <T>(sql: string) => (await env.DB.prepare(sql).all<T>()).results;

async function seed(items: Item[], entities: Entity[]) {
  await env.DB.batch([
    ...items.map((i) => env.DB.prepare(UPSERT_ITEM).bind(...itemRow(i))),
    ...entities.map((e) => env.DB.prepare(UPSERT_ENTITY).bind(...entityRow(e))),
  ]);
}

beforeEach(() => {
  env = { API_TOKEN: "t", DB: testDb().DB };
  calls = [];
});

describe("live watch", () => {
  beforeEach(() =>
    seed(
      [
        card({ entityId: "show" }),
        card({
          id: "list",
          kind: "Movie",
          title: "Movies to see",
          checklists: [
            {
              name: "List",
              rows: [
                { text: "Old one", done: false, entityId: "old" },
                { text: "Coming soon", done: false, entityId: "soon" },
                { text: "Seen", done: true, entityId: "seen" },
              ],
            },
          ],
        }),
      ],
      [
        thing({ id: "show", imdb: "tt0000001" }),
        thing({ id: "old", category: "movie", qid: "Q9", year: 1990 }),
        thing({ id: "soon", category: "movie", qid: "Q10", year: 2027 }),
        thing({ id: "seen", category: "movie", qid: "Q11", year: 2027 }),
        thing({ id: "orphan", category: "show", imdb: "tt9" }),
      ],
    ),
  );

  it("works out what each linked thing needs, and checks only what can change", async () => {
    const r = await run(T0);
    expect(r.watch.planned).toBe(5);
    const plans = await rows<{ entity_id: string; what: string; stop: string | null; ref: string | null }>(
      `SELECT entity_id, what, stop, ref FROM watch ORDER BY entity_id`,
    );
    expect(plans).toEqual([
      { entity_id: "old", what: "release", stop: "released", ref: null },
      { entity_id: "orphan", what: "tv", stop: "removed", ref: null },
      { entity_id: "seen", what: "release", stop: "done", ref: null },
      { entity_id: "show", what: "tv", stop: null, ref: "42" },
      { entity_id: "soon", what: "release", stop: null, ref: null },
    ]);
    // One TVmaze show (lookup + show) and one Wikidata query for the movie not out yet.
    expect(calls.filter((c) => /^GET https:\/\/(api\.tvmaze|query\.wikidata)/.test(c))).toHaveLength(3);
    const live = await rows<{ entity_id: string; data: string }>(`SELECT entity_id, data FROM live ORDER BY entity_id`);
    expect(
      live.map((l) => [l.entity_id, JSON.parse(l.data).nextEpisode?.date ?? JSON.parse(l.data).releaseDate]),
    ).toEqual([
      ["show", "2026-11-20"],
      ["soon", "2027-06-01"],
    ]);
    expect(await rows(`SELECT entity_id, url FROM covers`)).toEqual([
      { entity_id: "show", url: "https://static.tvmaze.example/42.jpg" },
    ]);
  });

  it("checks again when due, with one request once the TVmaze id is known", async () => {
    await run(T0);
    calls = [];
    await run(T0 + 10 * 60_000);
    expect(calls).toEqual([]);
    await run(T0 + 4 * DAY);
    expect(calls).toEqual([expect.stringContaining("tvmaze.com/shows/42?")]);
  });

  it("re-plans when Sid changes a card: dropping the show stops it", async () => {
    await run(T0);
    await seed([card({ entityId: "show", status: "dropped", updatedAt: T0 + 60_000 })], []);
    calls = [];
    await run(T0 + 10 * 60_000);
    expect(calls).toEqual([]);
    expect(await rows(`SELECT stop, next_check FROM watch WHERE entity_id = 'show'`)).toEqual([
      { stop: "dropped", next_check: null },
    ]);
  });

  it("an edit that changes nothing keeps the watch's date", async () => {
    await run(T0);
    const before = await rows(`SELECT next_check FROM watch WHERE entity_id = 'show'`);
    await seed([card({ entityId: "show", title: "Harbor Lights (renamed)", updatedAt: T0 + 60_000 })], []);
    calls = [];
    await run(T0 + 10 * 60_000);
    expect(calls).toEqual([]);
    expect(await rows(`SELECT next_check FROM watch WHERE entity_id = 'show'`)).toEqual(before);
  });

  it("never spends more than its budget, and leaves the rest for later runs", async () => {
    let spent = 0;
    const counting = new Budget(6, async (url, init) => {
      spent++;
      return fakeWeb(url, init);
    });
    const r = await runScheduledJobs(env, T0, counting);
    expect(counting.left).toBeGreaterThanOrEqual(0);
    expect(spent).toBeLessThanOrEqual(6);
    expect(r.budgetLeft).toBe(counting.left);
    // A tiny budget still plans (no outside requests); the checks wait, and so do connections.
    expect(r.connections).toBeNull();
    expect(r.watch.planned).toBe(5);
  });
});

describe("dead-link check", () => {
  const pasted = (links: string[], updatedAt = 100) =>
    card({ id: "cafe", kind: "Place", links: links.map((url) => ({ label: "Site", url })), updatedAt });

  it("finds pasted links, and calls one dead only after three gone answers a week apart", async () => {
    await seed([pasted(["https://ok.example/", "https://gone.example/menu"])], []);
    await run(T0);
    await run(T0 + 10 * 60_000);
    const states = () =>
      rows<{ url: string; state: string; misses: number }>(`SELECT url, state, misses FROM link_checks ORDER BY url`);
    expect(await states()).toEqual([
      { url: "https://gone.example/menu", state: "unsure", misses: 1 },
      { url: "https://ok.example/", state: "ok", misses: 0 },
    ]);
    await run(T0 + 8 * DAY);
    await run(T0 + 16 * DAY);
    expect((await states())[0]).toEqual({ url: "https://gone.example/menu", state: "dead", misses: 3 });
    calls = [];
    await run(T0 + 200 * DAY);
    expect(calls.filter((c) => c.includes("gone.example"))).toEqual([]);
  });

  it("forgets a link taken off the card", async () => {
    await seed([pasted(["https://ok.example/", "https://gone.example/menu"])], []);
    await run(T0);
    await seed([pasted(["https://ok.example/"], T0 + 60_000)], []);
    await run(T0 + 10 * 60_000);
    expect(await rows(`SELECT url FROM link_checks`)).toEqual([{ url: "https://ok.example/" }]);
  });

  it("answers GET /api/watch and /api/watch/links", async () => {
    await seed([pasted(["https://gone.example/menu"])], []);
    await run(T0);
    await run(T0 + 10 * 60_000);
    const auth = { Authorization: "Bearer t" };
    const forCard = await app.request("/api/watch/links?item=cafe", { headers: auth }, env);
    expect(await forCard.json()).toEqual({
      links: [{ url: "https://gone.example/menu", state: "unsure", httpStatus: 404, checkedAt: T0 }],
    });
    const summary = (await (await app.request("/api/watch", { headers: auth }, env)).json()) as {
      links: Record<string, { count: number }>;
      lastRun: number;
    };
    expect(summary.links.unsure?.count).toBe(1);
    expect(summary.lastRun).toBe(T0 + 10 * 60_000);
    const bad = await app.request("/api/watch/links", { headers: auth }, env);
    expect(bad.status).toBe(400);
  });
});
