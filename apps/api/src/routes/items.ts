import { Hono } from "hono";
import type { Item } from "@orbit/core";
import { UPSERT_ITEM, itemRow, parse } from "../db/statements.js";
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
  await c.env.DB.prepare(UPSERT_ITEM)
    .bind(...itemRow(item))
    .run();
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
