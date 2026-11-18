import type { Entity } from "@orbit/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { UPSERT_ENTITY, UPSERT_REVIEW, entityRow } from "../src/db/statements.js";
import type { Env } from "../src/env.js";
import { rematchUnlinked } from "../src/jobs/rematch.js";
import { testDb } from "./helpers/d1.js";

// Made-up data only.
const thing = (over: Partial<Entity>): Entity => ({
  id: "e1",
  name: "Harbor Tales by Ada Lane",
  category: "book",
  confidence: "none",
  updatedAt: 100,
  ...over,
});
const E = (q: string) => `http://www.wikidata.org/entity/${q}`;

/** Open Library knows "Harbor Tales" by Ada Lane; Wikidata knows "Sea Glass" by Bo Moss. */
function fakeWeb() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const u = decodeURIComponent(url);
    if (u.startsWith("https://openlibrary.org/search.json?q=key:"))
      return Response.json({ docs: [{ key: "/works/OL5W", author_name: ["Bo Moss"] }] });
    if (u.startsWith("https://openlibrary.org/search.json"))
      return Response.json({
        docs: u.includes("Harbor Tales")
          ? [{ key: "/works/OL1W", title: "Harbor Tales", author_name: ["Ada Lane"], edition_count: 4 }]
          : [],
      });
    const q = decodeURIComponent(String(init?.body ?? "").replace(/^query=/, ""));
    if (q.includes("EntitySearch"))
      return Response.json({
        results: {
          bindings: [
            {
              term: { value: "Sea Glass" },
              item: { value: E("Q9") },
              label: { value: "Sea Glass" },
              author: { value: "Bo Moss" },
              sites: { value: "3" },
            },
          ],
        },
      });
    return Response.json({ results: { bindings: [] } });
  });
}

let env: Env;
beforeEach(async () => {
  env = { API_TOKEN: "t", DB: testDb().DB };
  vi.stubGlobal("fetch", fakeWeb());
  await env.DB.batch([
    env.DB.prepare(UPSERT_ENTITY).bind(...entityRow(thing({ id: "e1" }))),
    env.DB.prepare(UPSERT_ENTITY).bind(...entityRow(thing({ id: "e2", name: "Lost Pages" }))),
    // Sid answered this one: left alone.
    env.DB.prepare(UPSERT_ENTITY).bind(...entityRow(thing({ id: "e3", name: "Harbor Tales" }))),
    env.DB.prepare(UPSERT_REVIEW).bind("e3", JSON.stringify({ d: "none" }), 1),
    // A linked book Wikidata didn't know by its Open Library id.
    env.DB.prepare(UPSERT_ENTITY).bind(
      ...entityRow(thing({ id: "e4", name: "Sea Glass", confidence: "high", openLibrary: "OL5W" })),
    ),
    env.DB.prepare(
      "INSERT INTO connect_state (entity_id, checked_at, next_check, status) VALUES ('e4', 1, 999999999999999, 'no-qid')",
    ),
  ]);
});
afterEach(() => vi.unstubAllGlobals());

const data = async (id: string) =>
  JSON.parse(
    (await env.DB.prepare("SELECT data FROM entities WHERE id = ?").bind(id).first<{ data: string }>())!.data,
  ) as Entity;

describe("rematchUnlinked", () => {
  it("links sure matches, leaves the rest and Sid's answers alone, and finds Wikidata ids by title", async () => {
    const r = await rematchUnlinked(env, 1000);
    expect(r).toMatchObject({ looked: 3, linked: 1, qids: 1, failed: 0 });
    expect(await data("e1")).toMatchObject({
      name: "Harbor Tales by Ada Lane",
      confidence: "high",
      openLibrary: "OL1W",
      author: "Ada Lane",
    });
    expect((await data("e2")).confidence).toBe("none");
    expect((await data("e3")).confidence).toBe("none");
    expect((await data("e4")).qid).toBe("Q9");
    const cs = await env.DB.prepare("SELECT next_check, status FROM connect_state WHERE entity_id = 'e4'").first<{
      next_check: number;
      status: string;
    }>();
    expect(cs).toEqual({ next_check: 1000, status: "mapped" });
  });

  it("doesn't look at the same rows twice", async () => {
    await rematchUnlinked(env, 1000);
    expect((await rematchUnlinked(env, 2000)).looked).toBe(0);
  });

  it("runs from POST /api/connections/run?rematch=1 and reports progress", async () => {
    const res = await app.request(
      "/api/connections/run?rematch=1",
      { method: "POST", headers: { Authorization: "Bearer t" } },
      env,
    );
    expect(((await res.json()) as { rematch: { linked: number } }).rematch.linked).toBe(1);
    const p = await app.request("/api/connections/progress", { headers: { Authorization: "Bearer t" } }, env);
    expect(((await p.json()) as { rematch: unknown }).rematch).toMatchObject({
      rematchLooked: 2,
      rematchLinked: 1,
      titleFound: 1,
    });
  });
});
