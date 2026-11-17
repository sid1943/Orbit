import { Hono } from "hono";
import type { Entity } from "@orbit/core";
import { UPSERT_ENTITY, entityRow, parse } from "../db/statements.js";
import type { AppEnv } from "../env.js";
import { idList } from "../lib/validation.js";

export const entities = new Hono<AppEnv>();

/** By ids (`?ids=a,b`), by confidence (`?confidence=review`), or all of them, newest first, in pages (`?limit=&offset=`, default 500, at most 2000). */
entities.get("/", async (c) => {
  const ids = idList(c.req.query("ids"));
  const conf = c.req.query("confidence");
  const db = c.env.DB;
  if (ids.length || conf) {
    const stmt = ids.length
      ? db.prepare(`SELECT data FROM entities WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids)
      : db.prepare("SELECT data FROM entities WHERE confidence = ? LIMIT 500").bind(conf);
    const { results } = await stmt.all<{ data: string }>();
    return c.json({ entities: results.map((r) => JSON.parse(r.data) as Entity) });
  }
  const limit = Math.min(Number(c.req.query("limit") ?? 500) || 500, 2000);
  const offset = Number(c.req.query("offset") ?? 0) || 0;
  const { results } = await db
    .prepare("SELECT data FROM entities ORDER BY updated_at DESC, id LIMIT ? OFFSET ?")
    .bind(limit, offset)
    .all<{ data: string }>();
  return c.json({
    entities: results.map((r) => JSON.parse(r.data) as Entity),
    next: results.length === limit ? offset + limit : null,
  });
});

/** One linked thing with its TV status and cover. */
entities.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const [e, live, cover] = await db.batch<{ data?: string; url?: string }>([
    db.prepare("SELECT data FROM entities WHERE id = ?").bind(id),
    db.prepare("SELECT data FROM live WHERE entity_id = ?").bind(id),
    db.prepare("SELECT url FROM covers WHERE entity_id = ?").bind(id),
  ]);
  const ent = e?.results[0]?.data;
  if (!ent) return c.json({ error: "not found" }, 404);
  const l = live?.results[0]?.data;
  return c.json({ ...JSON.parse(ent), live: l ? JSON.parse(l) : null, cover: cover?.results[0]?.url ?? null });
});

/** A link fixed by hand is marked "user", so the enricher never overrides it. */
entities.patch("/:id", async (c) => {
  const cur = parse<Entity>(
    await c.env.DB.prepare("SELECT data FROM entities WHERE id = ?").bind(c.req.param("id")).first(),
  );
  if (!cur) return c.json({ error: "not found" }, 404);
  const body = await c.req.json<Partial<Entity>>().catch(() => null);
  if (!body || typeof body !== "object") return c.json({ error: "send JSON" }, 400);
  const { id: _id, updatedAt: _updatedAt, ...rest } = body;
  const next: Entity = { ...cur, ...rest, confidence: rest.confidence ?? "user", updatedAt: Date.now() };
  await c.env.DB.prepare(UPSERT_ENTITY)
    .bind(...entityRow(next))
    .run();
  return c.json(next);
});
