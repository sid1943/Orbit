import { Hono } from "hono";
import { cardKey, type FullItem, type Item, type LiveStatus, type Review } from "@orbit/core";
import { CARD_ENTITY_IDS, UPSERT_ITEM, itemRow, parse, withReview, type EntityReviewRow } from "../db/statements.js";
import type { AppEnv } from "../env.js";
import { enqueue } from "../jobs/index.js";
import { parseItemFields } from "../lib/validation.js";

export const items = new Hono<AppEnv>();

const getItem = async (db: D1Database, id: string) =>
  parse<Item>(await db.prepare("SELECT data FROM items WHERE id = ?").bind(id).first());

/** Light list for boards and search; `full=1` returns whole records. */
items.get("/", async (c) => {
  const q = c.req.query();
  const limit = Math.min(Number(q.limit ?? 500) || 500, 2000);
  const offset = Number(q.offset ?? 0) || 0;
  const where = ["updated_at > ?"];
  const args: unknown[] = [Number(q.since ?? 0) || 0];
  if (q.deleted !== "1") where.push("deleted = 0");
  if (q.kind) {
    where.push("kind = ?");
    args.push(q.kind);
  }
  if (q.status) {
    where.push("status = ?");
    args.push(q.status);
  }
  const full = q.full === "1";
  const cols = full
    ? "data"
    : "id, kind, title, status, archived, deleted, entity_id AS entityId, due, updated_at AS updatedAt";
  const { results } = await c.env.DB.prepare(
    `SELECT ${cols} FROM items WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
  )
    .bind(...args, limit, offset)
    .all<Record<string, unknown>>();
  const list = full
    ? results.map((r) => JSON.parse(r.data as string) as Item)
    : results.map((r) => ({ ...r, archived: !!r.archived, deleted: !!r.deleted }));
  return c.json({ items: list, next: results.length === limit ? offset + limit : null });
});

items.get("/:id", async (c) => {
  const it = await getItem(c.env.DB, c.req.param("id"));
  return it ? c.json(it) : c.json({ error: "not found" }, 404);
});

/**
 * One card with everything its panel shows: the card, its linked thing and every checklist row's
 * linked thing (review answers applied), their TV status and covers, and the review answers about
 * them (including hidden links, `x:` keys, and the card's own `card-<id>` answer). No limit on list size.
 */
items.get("/:id/full", async (c) => {
  const id = c.req.param("id");
  const db = c.env.DB;
  const [item, ents, live, covers, revs] = await db.batch<Record<string, unknown>>([
    db.prepare("SELECT data FROM items WHERE id = ?1").bind(id),
    db
      .prepare(
        `${CARD_ENTITY_IDS} SELECT e.data, rv.decision FROM entities e JOIN ids ON ids.id = e.id LEFT JOIN reviews rv ON rv.entity_id = e.id`,
      )
      .bind(id),
    db.prepare(`${CARD_ENTITY_IDS} SELECT l.data FROM live l JOIN ids ON ids.id = l.entity_id`).bind(id),
    db
      .prepare(`${CARD_ENTITY_IDS} SELECT cv.entity_id, cv.url FROM covers cv JOIN ids ON ids.id = cv.entity_id`)
      .bind(id),
    db
      .prepare(
        `${CARD_ENTITY_IDS} SELECT entity_id, decision, at FROM reviews
        WHERE entity_id IN (SELECT id FROM ids) OR entity_id IN (SELECT 'x:' || id FROM ids)
        OR entity_id IN (?2, ?3)`,
      )
      .bind(id, cardKey(id), `x:${cardKey(id)}`),
  ]);
  const data = item?.results[0]?.data;
  if (typeof data !== "string") return c.json({ error: "not found" }, 404);
  const full: FullItem = {
    item: JSON.parse(data) as Item,
    entities: ((ents?.results ?? []) as unknown as EntityReviewRow[]).map(withReview),
    live: (live?.results ?? []).map((r) => JSON.parse(String(r.data)) as LiveStatus),
    covers: Object.fromEntries((covers?.results ?? []).map((r) => [String(r.entity_id), String(r.url)])),
    reviews: (revs?.results ?? []).map((r): Review => ({
      entityId: String(r.entity_id),
      decision: JSON.parse(String(r.decision)),
      at: Number(r.at),
    })),
  };
  return c.json(full);
});

/** Add a card. It is queued for linking unless it already has a linked thing. */
items.post("/", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return c.json({ error: "send JSON" }, 400);
  const parsed = parseItemFields(body);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const f = parsed.value;
  if (!f.title || !f.kind) return c.json({ error: "title and kind are required" }, 400);
  const now = Date.now();
  const item: Item = {
    id: typeof body.id === "string" && body.id ? body.id : `it_${crypto.randomUUID()}`,
    kind: f.kind,
    title: f.title.trim(),
    status: f.status ?? "todo",
    tags: f.tags ?? [],
    source: "Added in Orbit",
    props: f.props ?? {},
    notes: f.notes ?? "",
    due: f.due ?? null,
    start: f.start ?? null,
    archived: !!f.archived,
    deleted: false,
    entityId: f.entityId ?? null,
    refs: f.refs ?? [],
    links: f.links ?? [],
    attachments: f.attachments ?? [],
    comments: f.comments ?? [],
    checklists: f.checklists ?? [],
    coverId: null,
    createdAt: now,
    updatedAt: now,
  };
  await c.env.DB.batch([
    c.env.DB.prepare(UPSERT_ITEM).bind(...itemRow(item)),
    // A card brought back under an id that was removed for good is live again.
    c.env.DB.prepare("DELETE FROM removed WHERE id = ?").bind(item.id),
  ]);
  if (!item.entityId) await enqueue(c.env, item.id, now);
  return c.json(item, 201);
});

items.patch("/:id", async (c) => {
  const cur = await getItem(c.env.DB, c.req.param("id"));
  if (!cur) return c.json({ error: "not found" }, 404);
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return c.json({ error: "send JSON" }, 400);
  const parsed = parseItemFields(body);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const next: Item = { ...cur, ...parsed.value, id: cur.id, updatedAt: Date.now() };
  await c.env.DB.prepare(UPSERT_ITEM)
    .bind(...itemRow(next))
    .run();
  // A renamed card that is still unlinked gets another try.
  if (parsed.value.title && parsed.value.title !== cur.title && !next.entityId) await enqueue(c.env, next.id);
  return c.json(next);
});

/** Moves a card to deleted; `?hard=1` removes the row for good. */
items.delete("/:id", async (c) => {
  const id = c.req.param("id");
  if (c.req.query("hard") === "1") {
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM items WHERE id = ?").bind(id),
      c.env.DB.prepare("DELETE FROM enrich_queue WHERE item_id = ?").bind(id),
      // Remembered so the next sync tells other devices to drop it.
      c.env.DB.prepare(
        "INSERT INTO removed (id, removed_at) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET removed_at = ?2",
      ).bind(id, Date.now()),
    ]);
    return c.json({ ok: true, hard: true });
  }
  const cur = await getItem(c.env.DB, id);
  if (!cur) return c.json({ error: "not found" }, 404);
  await c.env.DB.prepare(UPSERT_ITEM)
    .bind(...itemRow({ ...cur, deleted: true, updatedAt: Date.now() }))
    .run();
  return c.json({ ok: true });
});
