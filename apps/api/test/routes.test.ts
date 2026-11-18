import { toSyncItem, type Entity, type Item, type PlacesPage, type SyncItem, type SyncPage } from "@orbit/core";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { UPSERT_COVER, UPSERT_ENTITY, UPSERT_ITEM, UPSERT_REVIEW, entityRow, itemRow } from "../src/db/statements.js";
import type { Env } from "../src/env.js";
import { testDb } from "./helpers/d1.js";

// Made-up data only.
const card = (over: Partial<Item> = {}): Item => ({
  id: "it1",
  kind: "Movie",
  title: "Harbor Lights",
  status: "todo",
  tags: ["noir"],
  source: "Added in Orbit",
  props: { Quest: "Classics" },
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
  name: "Harbor Lights",
  category: "movie",
  confidence: "high",
  updatedAt: 100,
  ...over,
});

let env: Env;
const auth = { Authorization: "Bearer t" };
const get = async <T>(path: string): Promise<{ status: number; body: T }> => {
  const res = await app.request(path, { headers: auth }, env);
  return { status: res.status, body: (await res.json()) as T };
};
const send = async (method: string, path: string, body?: unknown) => {
  const res = await app.request(
    path,
    {
      method,
      headers: { ...auth, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    env,
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

async function seed(items: Item[], entities: Entity[] = []) {
  await env.DB.batch([
    ...items.map((i) => env.DB.prepare(UPSERT_ITEM).bind(...itemRow(i))),
    ...entities.map((e) => env.DB.prepare(UPSERT_ENTITY).bind(...entityRow(e))),
  ]);
}

beforeEach(() => {
  env = { API_TOKEN: "t", DB: testDb().DB };
});

describe("GET /api/sync", () => {
  it("sends every card in light form, matching core's toSyncItem", async () => {
    const list = card({
      id: "it2",
      kind: "Place",
      title: "Coast towns",
      entityId: "p1",
      checklists: [
        {
          name: "Stops",
          rows: [
            { text: "Pier", done: true },
            { text: "Mill", done: false },
          ],
        },
        { name: "More", rows: [{ text: "Bay", done: true }] },
      ],
    });
    await seed(
      [card(), list, card({ id: "it3", deleted: true })],
      [thing({ id: "p1", category: "natural_place", confidence: "map", lat: 10, lng: 20 })],
    );
    await env.DB.prepare(UPSERT_COVER).bind("p1", "https://c.example/p.jpg", "example", 100).run();
    const { status, body } = await get<SyncPage>("/api/sync");
    expect(status).toBe(200);
    expect(body.items.map((i) => i.id)).toEqual(["it1", "it2", "it3"]);
    expect(body.next).toBeNull();
    const row = body.items.find((i) => i.id === "it2")!;
    const expected: SyncItem = toSyncItem(list, {
      category: "natural_place",
      confidence: "map",
      lat: 10,
      lng: 20,
      cover: "https://c.example/p.jpg",
    });
    expect(row).toEqual(expected);
    expect(row).toMatchObject({ done: 2, total: 3, tags: ["noir"], props: { Quest: "Classics" } });
    expect(body.items.find((i) => i.id === "it3")?.deleted).toBe(true);
  });

  it("pages by id", async () => {
    await seed(["a", "b", "c"].map((id) => card({ id })));
    const first = await get<SyncPage>("/api/sync?limit=2");
    expect(first.body.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(first.body.next).toBe("b");
    const second = await get<SyncPage>("/api/sync?limit=2&after=b");
    expect(second.body.items.map((i) => i.id)).toEqual(["c"]);
    expect(second.body.next).toBeNull();
  });

  it("sends only what changed since, including removed cards and review answers", async () => {
    const old = Date.now() - 60_000;
    await seed(
      [card({ id: "a", updatedAt: old }), card({ id: "b", updatedAt: old, entityId: "e1" })],
      [thing({ id: "e1", confidence: "review", updatedAt: old })],
    );
    const since = old + 10_000;
    expect((await get<SyncPage>(`/api/sync?since=${since}`)).body.items).toEqual([]);

    await send("PUT", "/api/reviews/e1", { d: "yes" });
    await send("DELETE", "/api/items/a?hard=1");
    const { body } = await get<SyncPage>(`/api/sync?since=${since}`);
    expect(body.items.map((i) => [i.id, i.confidence])).toEqual([["b", "high"]]);
    expect(body.removed).toEqual(["a"]);
    expect(body.at).toBeGreaterThan(since);
  });
});

describe("GET /api/items/:id/full", () => {
  it("returns every linked thing on a big list, with answers applied", async () => {
    const rows = Array.from({ length: 150 }, (_, n) => ({ text: `Place ${n}`, done: false, entityId: `p${n}` }));
    await seed(
      [card({ id: "list", entityId: "e1", checklists: [{ name: "All", rows }] })],
      [
        thing({ id: "e1", confidence: "review", candidate: { q: "Q1", imdb: "tt0000001" } as Partial<Entity> }),
        ...rows.map((r) => thing({ id: r.entityId, name: r.text, category: "museum", confidence: "map" })),
      ],
    );
    await env.DB.batch([
      env.DB.prepare(UPSERT_REVIEW).bind("e1", JSON.stringify({ d: "yes" }), 1),
      env.DB.prepare(UPSERT_REVIEW).bind("x:p3", JSON.stringify({ d: "hide", urls: ["https://x.example"] }), 1),
      env.DB.prepare(UPSERT_REVIEW).bind("x:card-list", JSON.stringify({ d: "hide", urls: ["https://y.example"] }), 1),
      env.DB.prepare(UPSERT_REVIEW).bind("unrelated", JSON.stringify({ d: "no" }), 1),
    ]);
    const { status, body } = await get<{
      item: Item;
      entities: Entity[];
      reviews: { entityId: string }[];
      covers: Record<string, string>;
      live: unknown[];
    }>("/api/items/list/full");
    expect(status).toBe(200);
    expect(body.item.id).toBe("list");
    expect(body.entities).toHaveLength(151);
    expect(body.entities.find((e) => e.id === "e1")).toMatchObject({
      confidence: "high",
      imdb: "tt0000001",
      reviewed: "yes",
    });
    expect(body.reviews.map((r) => r.entityId).sort()).toEqual(["e1", "x:card-list", "x:p3"]);
  });

  it("answers 404 for an unknown card", async () => {
    expect((await get("/api/items/nope/full")).status).toBe(404);
  });
});

describe("GET /api/places", () => {
  const parks = () =>
    card({
      id: "parks",
      kind: "Place",
      title: "Parks",
      entityId: "pk",
      status: "done",
      checklists: [
        {
          name: "West",
          rows: [
            { text: "1. **North Falls**", done: true, entityId: "p1" },
            { text: "Plain note", done: false },
            { text: "Studio tour", done: false, entityId: "tv" },
          ],
        },
        { name: "Town", rows: [{ text: "Taco stand", done: false, entityId: "p2" }] },
      ],
    });
  const places = () => [
    thing({ id: "pk", category: "us_park", confidence: "high", lat: 1, lng: 1 }),
    thing({ id: "p1", category: "natural_place", confidence: "map", lat: 2, lng: 2 }),
    thing({ id: "tv", category: "show_taping", confidence: "map", lat: 3, lng: 3 }),
    thing({ id: "p2", category: "eatery", confidence: "map", location: "San Jose, CA" }),
    thing({ id: "m1", category: "movie" }),
  ];

  it("lists the card and its checklist rows that are places, with where they sit", async () => {
    await seed([parks(), card({ id: "film", entityId: "m1" })], places());
    const { body } = await get<PlacesPage>("/api/places");
    expect(body.items).toBeNull();
    expect(body.places.map((p) => [p.itemId, p.checklist, p.row, p.entityId, p.done])).toEqual([
      ["parks", null, null, "pk", true],
      ["parks", 0, 0, "p1", true],
      ["parks", 1, 0, "p2", false],
    ]);
    expect(body.places[1]).toMatchObject({ text: "1. **North Falls**", lat: 2, lng: 2, category: "natural_place" });
    expect(body.places[2]).toMatchObject({ lat: null, location: "San Jose, CA" });
  });

  it("drops a rejected guess's spot, and sends only changed cards after since", async () => {
    const old = Date.now() - 60_000;
    await seed(
      [{ ...parks(), updatedAt: old }, card({ id: "other", entityId: "o1", updatedAt: old })],
      [
        ...places().map((e) => ({ ...e, updatedAt: old })),
        thing({ id: "o1", category: "museum", lat: 5, lng: 5, updatedAt: old }),
      ],
    );
    const since = old + 10_000;
    expect((await get<PlacesPage>(`/api/places?since=${since}`)).body).toMatchObject({ places: [], items: [] });

    await send("PUT", "/api/reviews/p1", { d: "no" });
    const after = (await get<PlacesPage>(`/api/places?since=${since}`)).body;
    expect(after.items).toEqual(["parks"]);
    expect(after.places.map((p) => p.entityId)).toEqual(["pk", "p2"]);

    await send("DELETE", "/api/items/other?hard=1");
    expect((await get<PlacesPage>(`/api/places?since=${since}`)).body.items?.sort()).toEqual(["other", "parks"]);
  });
});

describe("kinds", () => {
  type K = { name: string; hue: number; order: number; standard: boolean; count: number };
  const kindsNow = async () => (await get<{ kinds: K[] }>("/api/kinds")).body.kinds;

  it("lists the standard kinds in order, then custom ones, even with no cards", async () => {
    await seed([card({ id: "a", kind: "Movie" }), card({ id: "b", kind: "Movie", deleted: true })]);
    const list = await kindsNow();
    expect(list).toHaveLength(13);
    expect(list[0]).toMatchObject({ name: "To-do", order: 0, standard: true, count: 0 });
    expect(list.find((k) => k.name === "Movie")?.count).toBe(1);

    const added = await send("POST", "/api/kinds", { name: " Zine ", hue: 40 });
    expect(added.status).toBe(201);
    expect(added.body.kind).toEqual({ name: "Zine", hue: 40, order: 13, standard: false, count: 0 });
    expect((await kindsNow()).at(-1)).toMatchObject({ name: "Zine", count: 0 });
  });

  it("refuses empty and duplicate names in any capitalization, and bad hues", async () => {
    await send("POST", "/api/kinds", { name: "Zine", hue: 40 });
    expect((await send("POST", "/api/kinds", { name: "" })).status).toBe(400);
    expect((await send("POST", "/api/kinds", { name: "ZINE" })).body.error).toMatch(/already a kind called Zine/);
    expect((await send("POST", "/api/kinds", { name: "movie" })).status).toBe(400);
    expect((await send("POST", "/api/kinds", { name: "Comics", hue: 400 })).status).toBe(400);
    const auto = await send("POST", "/api/kinds", { name: "Comics" });
    expect(typeof (auto.body.kind as K).hue).toBe("number");
  });

  it("renames a kind and moves its cards, recolours and reorders", async () => {
    await send("POST", "/api/kinds", { name: "Zine", hue: 40 });
    await send("POST", "/api/kinds", { name: "Comics", hue: 300 });
    await seed([card({ id: "z1", kind: "Zine", updatedAt: 1 }), card({ id: "z2", kind: "Zine", deleted: true })]);
    const renamed = await send("PATCH", "/api/kinds/zine", { name: "Fanzine", hue: 50 });
    expect(renamed.status).toBe(200);
    expect(renamed.body.moved).toBe(2);
    const full = await get<{ item: Item }>("/api/items/z1/full");
    expect(full.body.item.kind).toBe("Fanzine");
    expect(full.body.item.updatedAt).toBeGreaterThan(1);
    const synced = await get<SyncPage>("/api/sync");
    expect(synced.body.items.find((i) => i.id === "z1")?.kind).toBe("Fanzine");
    expect((await send("PATCH", "/api/kinds/Fanzine", { name: "comics" })).status).toBe(400);
    expect((await send("PATCH", "/api/kinds/Movie", { hue: 1 })).status).toBe(400);
    expect((await send("PATCH", "/api/kinds/Nope", { hue: 1 })).status).toBe(404);

    expect((await send("PUT", "/api/kinds/order", { names: ["Comics"] })).status).toBe(400);
    await send("PUT", "/api/kinds/order", { names: ["Comics", "Fanzine"] });
    expect((await kindsNow()).slice(-2).map((k) => [k.name, k.hue, k.order])).toEqual([
      ["Comics", 300, 13],
      ["Fanzine", 50, 14],
    ]);
  });

  it("deletes a custom kind only when it has no cards", async () => {
    await send("POST", "/api/kinds", { name: "Zine", hue: 40 });
    await seed([card({ id: "z1", kind: "Zine" })]);
    const refused = await send("DELETE", "/api/kinds/Zine");
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ count: 1, error: expect.stringMatching(/has 1 card/) });
    expect((await send("DELETE", "/api/kinds/Movie")).status).toBe(400);
    await send("DELETE", "/api/items/z1?hard=1");
    expect((await send("DELETE", "/api/kinds/Zine")).status).toBe(200);
    expect(await kindsNow()).toHaveLength(13);
  });

  it("can't be written around through prefs", async () => {
    expect((await send("PUT", "/api/prefs/kinds", [{ name: "Movie", hue: 1 }])).status).toBe(400);
  });
});

describe("GET /api/entities", () => {
  it("takes more than 100 ids at once", async () => {
    const many = Array.from({ length: 150 }, (_, n) => thing({ id: `e${n}` }));
    await seed([], many);
    const { body } = await get<{ entities: Entity[] }>(`/api/entities?ids=${many.map((e) => e.id).join(",")}`);
    expect(body.entities).toHaveLength(150);
  });

  it("refuses too many ids instead of cutting them", async () => {
    const ids = Array.from({ length: 2001 }, (_, n) => `e${n}`).join(",");
    expect((await get(`/api/entities?ids=${ids}`)).status).toBe(400);
  });

  it("lists only unanswered guesses with pending=1", async () => {
    await seed([], [thing({ id: "a", confidence: "review" }), thing({ id: "b", confidence: "review" })]);
    await send("PUT", "/api/reviews/a", { d: "none" });
    const all = await get<{ entities: Entity[] }>("/api/entities?confidence=review");
    expect(all.body.entities.map((e) => [e.id, e.confidence]).sort()).toEqual([
      ["a", "nolink"],
      ["b", "review"],
    ]);
    const pending = await get<{ entities: Entity[] }>("/api/entities?confidence=review&pending=1");
    expect(pending.body.entities.map((e) => e.id)).toEqual(["b"]);
  });

  it("checks what a fix may change", async () => {
    await seed([], [thing()]);
    expect((await send("PATCH", "/api/entities/e1", { year: "soon" })).status).toBe(400);
    const ok = await send("PATCH", "/api/entities/e1", { imdb: "tt0000009", id: "other" });
    expect(ok.body).toMatchObject({ id: "e1", imdb: "tt0000009", confidence: "user" });
  });
});

describe("reviews", () => {
  it("applies an answer and undoes it", async () => {
    await seed([], [thing({ confidence: "review", candidate: { qid: "Q1", label: "Guess" } })]);
    expect((await send("PUT", "/api/reviews/e1", { d: "alt" })).status).toBe(400);
    expect((await send("PUT", "/api/reviews/e1", { d: "alt", qid: "Q9" })).status).toBe(200);
    expect((await get<Entity>("/api/entities/e1")).body).toMatchObject({ qid: "Q9", confidence: "high" });
    await send("DELETE", "/api/reviews/e1");
    expect((await get<Entity>("/api/entities/e1")).body).toMatchObject({ confidence: "review" });
  });
});

describe("prefs", () => {
  it("refuses unknown settings", async () => {
    expect((await send("PUT", "/api/prefs/nope", { a: 1 })).status).toBe(400);
    expect((await send("PUT", "/api/prefs/profile", { name: "Test" })).status).toBe(200);
  });
});

describe("items", () => {
  it("brings back a card added again under a removed id", async () => {
    await send("POST", "/api/items", { id: "x", title: "Again", kind: "Note" });
    await send("DELETE", "/api/items/x?hard=1");
    await send("POST", "/api/items", { id: "x", title: "Again", kind: "Note" });
    const { body } = await get<SyncPage>(`/api/sync?since=1`);
    expect(body.removed).toEqual([]);
    expect(body.items.map((i) => i.id)).toEqual(["x"]);
  });
});
