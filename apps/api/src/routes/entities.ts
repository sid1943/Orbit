import { Hono } from "hono";
import type { Entity } from "@orbit/core";
import { IN_JSON, UPSERT_ENTITY, entityRow, parse, withReview, type EntityReviewRow } from "../db/statements.js";
import type { AppEnv } from "../env.js";
import { idList, intParam, parseEntityFields } from "../lib/validation.js";

export const entities = new Hono<AppEnv>();

const SELECT = "SELECT e.data, rv.decision FROM entities e LEFT JOIN reviews rv ON rv.entity_id = e.id";

/**
 * Linked things, with Sid's review answers applied:
 * by ids (`?ids=a,b`, up to 2000), by confidence (`?confidence=review`, add `&pending=1` for only the
 * unanswered ones), or all of them, newest first, in pages (`?limit=&offset=`, default 500, at most 2000).
 */
entities.get("/", async (c) => {
  const ids = idList(c.req.query("ids"));
  if (!ids.ok) return c.json({ error: ids.error }, 400);
  const conf = c.req.query("confidence");
  const db = c.env.DB;
  if (ids.value.length) {
    const { results } = await db
      .prepare(`${SELECT} WHERE e.id IN (${IN_JSON})`)
      .bind(JSON.stringify(ids.value))
      .all<EntityReviewRow>();
    return c.json({ entities: results.map(withReview) });
  }
  if (conf) {
    const pending = c.req.query("pending") === "1" ? " AND rv.entity_id IS NULL" : "";
    const { results } = await db
      .prepare(`${SELECT} WHERE e.confidence = ?${pending} ORDER BY e.updated_at DESC, e.id LIMIT 2000`)
      .bind(conf)
      .all<EntityReviewRow>();
    return c.json({ entities: results.map(withReview) });
  }
  const limit = Math.min(intParam(c.req.query("limit"), 500) || 500, 2000);
  const offset = intParam(c.req.query("offset"), 0);
  const { results } = await db
    .prepare(`${SELECT} ORDER BY e.updated_at DESC, e.id LIMIT ? OFFSET ?`)
    .bind(limit, offset)
    .all<EntityReviewRow>();
  return c.json({ entities: results.map(withReview), next: results.length === limit ? offset + limit : null });
});

/** One linked thing with its TV status and cover. */
entities.get("/:id", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const [e, live, cover] = await db.batch<{ data?: string; decision?: string | null; url?: string }>([
    db.prepare(`${SELECT} WHERE e.id = ?`).bind(id),
    db.prepare("SELECT data FROM live WHERE entity_id = ?").bind(id),
    db.prepare("SELECT url FROM covers WHERE entity_id = ?").bind(id),
  ]);
  const row = e?.results[0];
  if (!row?.data) return c.json({ error: "not found" }, 404);
  const l = live?.results[0]?.data;
  return c.json({
    ...withReview({ data: row.data, decision: row.decision ?? null }),
    live: l ? JSON.parse(l) : null,
    cover: cover?.results[0]?.url ?? null,
  });
});

/** A link fixed by hand is marked "user", so the enricher never overrides it. */
entities.patch("/:id", async (c) => {
  const cur = parse<Entity>(
    await c.env.DB.prepare("SELECT data FROM entities WHERE id = ?").bind(c.req.param("id")).first(),
  );
  if (!cur) return c.json({ error: "not found" }, 404);
  const parsed = parseEntityFields(await c.req.json().catch(() => null));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const next: Entity = {
    ...cur,
    ...parsed.value,
    confidence: parsed.value.confidence ?? "user",
    updatedAt: Date.now(),
  };
  await c.env.DB.prepare(UPSERT_ENTITY)
    .bind(...entityRow(next))
    .run();
  return c.json(next);
});
