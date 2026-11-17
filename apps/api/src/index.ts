import { Hono } from "hono";
import { cors } from "hono/cors";
import { STATUSES, type Entity, type Item, type ReviewDecision } from "@orbit/core";
import { type Env, UPSERT_ENTITY, UPSERT_ITEM, UPSERT_REVIEW, entityRow, itemRow, parse } from "./db.js";
import { enqueue, refreshShows, runEnrichQueue } from "./enricher.js";

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", cors({ origin: (o) => o, allowHeaders: ["Authorization", "Content-Type"], allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE"] }));

app.get("/api/health", (c) => c.json({ ok: true, app: "orbit", version: "0.1.0" }));

// Everything else needs the token Sid set with `wrangler secret put API_TOKEN`.
app.use("/api/*", async (c, next) => {
  const want = c.env.API_TOKEN;
  const got = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!want || !(await sameSecret(got, want))) return c.json({ error: "unauthorized" }, 401);
  await next();
});

async function sameSecret(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i]! ^ v[i]!;
  return diff === 0;
}

// ---------- items ----------

/** Lightweight list for boards and search. Full records come from GET /api/items/:id. */
app.get("/api/items", async (c) => {
  const kind = c.req.query("kind");
  const status = c.req.query("status");
  const since = Number(c.req.query("since") ?? 0);
  const limit = Math.min(Number(c.req.query("limit") ?? 500), 2000);
  const offset = Number(c.req.query("offset") ?? 0);
  const full = c.req.query("full") === "1";
  const where: string[] = ["updated_at > ?"];
  const args: unknown[] = [since];
  if (c.req.query("deleted") !== "1") where.push("deleted = 0");
  if (kind) { where.push("kind = ?"); args.push(kind); }
  if (status) { where.push("status = ?"); args.push(status); }
  const cols = full ? "data" : "id, kind, title, status, archived, deleted, entity_id AS entityId, due, updated_at AS updatedAt";
  const { results } = await c.env.DB.prepare(`SELECT ${cols} FROM items WHERE ${where.join(" AND ")} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
    .bind(...args, limit, offset).all<Record<string, unknown>>();
  const items = full ? results.map((r) => JSON.parse(r.data as string)) : results.map((r) => ({ ...r, archived: !!r.archived, deleted: !!r.deleted }));
  return c.json({ items, next: results.length === limit ? offset + limit : null });
});

app.get("/api/items/:id", async (c) => {
  const it = parse<Item>(await c.env.DB.prepare("SELECT data FROM items WHERE id = ?").bind(c.req.param("id")).first());
  return it ? c.json(it) : c.json({ error: "not found" }, 404);
});

const EDITABLE = ["kind", "title", "status", "tags", "props", "notes", "due", "start", "archived", "deleted", "entityId", "refs", "links", "attachments", "comments", "checklists", "coverId"] as const;

function clean(body: Record<string, unknown>): Partial<Item> | string {
  const out: Record<string, unknown> = {};
  for (const k of EDITABLE) if (k in body) out[k] = body[k];
  if ("title" in out && (typeof out.title !== "string" || !out.title.trim())) return "title must be a non-empty string";
  if ("status" in out && !(STATUSES as readonly unknown[]).includes(out.status)) return `status must be one of ${STATUSES.join(", ")}`;
  if ("due" in out && out.due !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(out.due))) return "due must be YYYY-MM-DD or null";
  return out as Partial<Item>;
}

app.post("/api/items", async (c) => {
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return c.json({ error: "send JSON" }, 400);
  const fields = clean(body);
  if (typeof fields === "string") return c.json({ error: fields }, 400);
  if (!fields.title || !fields.kind) return c.json({ error: "title and kind are required" }, 400);
  const now = Date.now();
  const item: Item = {
    id: typeof body.id === "string" && body.id ? body.id : `it_${crypto.randomUUID()}`,
    kind: fields.kind, title: fields.title.trim(), status: fields.status ?? "todo",
    tags: fields.tags ?? [], source: "Added in Orbit", props: fields.props ?? {}, notes: fields.notes ?? "",
    due: fields.due ?? null, start: fields.start ?? null, archived: !!fields.archived, deleted: false,
    entityId: fields.entityId ?? null, refs: fields.refs ?? [], links: fields.links ?? [], attachments: fields.attachments ?? [],
    comments: fields.comments ?? [], checklists: fields.checklists ?? [], coverId: null, createdAt: now, updatedAt: now,
  };
  await c.env.DB.prepare(UPSERT_ITEM).bind(...itemRow(item)).run();
  if (!item.entityId) await enqueue(c.env, item.id, now);
  return c.json(item, 201);
});

app.patch("/api/items/:id", async (c) => {
  const cur = parse<Item>(await c.env.DB.prepare("SELECT data FROM items WHERE id = ?").bind(c.req.param("id")).first());
  if (!cur) return c.json({ error: "not found" }, 404);
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return c.json({ error: "send JSON" }, 400);
  const fields = clean(body);
  if (typeof fields === "string") return c.json({ error: fields }, 400);
  const next: Item = { ...cur, ...fields, id: cur.id, updatedAt: Date.now() };
  await c.env.DB.prepare(UPSERT_ITEM).bind(...itemRow(next)).run();
  // A renamed, still-unlinked item gets another try at finding its link.
  if (fields.title && fields.title !== cur.title && !next.entityId) await enqueue(c.env, next.id);
  return c.json(next);
});

/** Soft delete (like the old app). Pass ?hard=1 to remove the row for good. */
app.delete("/api/items/:id", async (c) => {
  const id = c.req.param("id");
  if (c.req.query("hard") === "1") {
    await c.env.DB.batch([c.env.DB.prepare("DELETE FROM items WHERE id = ?").bind(id), c.env.DB.prepare("DELETE FROM enrich_queue WHERE item_id = ?").bind(id)]);
    return c.json({ ok: true, hard: true });
  }
  const cur = parse<Item>(await c.env.DB.prepare("SELECT data FROM items WHERE id = ?").bind(id).first());
  if (!cur) return c.json({ error: "not found" }, 404);
  await c.env.DB.prepare(UPSERT_ITEM).bind(...itemRow({ ...cur, deleted: true, updatedAt: Date.now() })).run();
  return c.json({ ok: true });
});

// ---------- linked things ----------

app.get("/api/entities", async (c) => {
  const ids = (c.req.query("ids") ?? "").split(",").filter(Boolean).slice(0, 90);
  const conf = c.req.query("confidence");
  const stmt = ids.length
    ? c.env.DB.prepare(`SELECT data FROM entities WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids)
    : conf
      ? c.env.DB.prepare("SELECT data FROM entities WHERE confidence = ? LIMIT 500").bind(conf)
      : c.env.DB.prepare("SELECT data FROM entities ORDER BY updated_at DESC LIMIT 500");
  const { results } = await stmt.all<{ data: string }>();
  return c.json({ entities: results.map((r) => JSON.parse(r.data) as Entity) });
});

app.get("/api/entities/:id", async (c) => {
  const id = c.req.param("id");
  const [e, live, cover] = await c.env.DB.batch<{ data?: string; url?: string }>([
    c.env.DB.prepare("SELECT data FROM entities WHERE id = ?").bind(id),
    c.env.DB.prepare("SELECT data FROM live WHERE entity_id = ?").bind(id),
    c.env.DB.prepare("SELECT url FROM covers WHERE entity_id = ?").bind(id),
  ]);
  const ent = e?.results[0]?.data;
  if (!ent) return c.json({ error: "not found" }, 404);
  const l = live?.results[0]?.data;
  return c.json({ ...JSON.parse(ent), live: l ? JSON.parse(l) : null, cover: cover?.results[0]?.url ?? null });
});

/** Sid fixing a link himself: the result is marked "user" so the enricher never overrides it. */
app.patch("/api/entities/:id", async (c) => {
  const cur = parse<Entity>(await c.env.DB.prepare("SELECT data FROM entities WHERE id = ?").bind(c.req.param("id")).first());
  if (!cur) return c.json({ error: "not found" }, 404);
  const body = await c.req.json<Partial<Entity>>().catch(() => null);
  if (!body) return c.json({ error: "send JSON" }, 400);
  const { id: _id, updatedAt: _u, ...rest } = body;
  const next: Entity = { ...cur, ...rest, confidence: rest.confidence ?? "user", updatedAt: Date.now() };
  await c.env.DB.prepare(UPSERT_ENTITY).bind(...entityRow(next)).run();
  return c.json(next);
});

app.get("/api/live", async (c) => {
  const ids = (c.req.query("ids") ?? "").split(",").filter(Boolean).slice(0, 90);
  if (!ids.length) return c.json({ live: [] });
  const marks = ids.map(() => "?").join(",");
  const [live, covers] = await c.env.DB.batch<{ entity_id: string; data?: string; url?: string }>([
    c.env.DB.prepare(`SELECT entity_id, data FROM live WHERE entity_id IN (${marks})`).bind(...ids),
    c.env.DB.prepare(`SELECT entity_id, url FROM covers WHERE entity_id IN (${marks})`).bind(...ids),
  ]);
  return c.json({
    live: (live?.results ?? []).map((r) => JSON.parse(r.data!)),
    covers: Object.fromEntries((covers?.results ?? []).map((r) => [r.entity_id, r.url])),
  });
});

// ---------- reviews ----------

app.get("/api/reviews", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT entity_id, decision, at FROM reviews").all<{ entity_id: string; decision: string; at: number }>();
  return c.json({ reviews: results.map((r) => ({ entityId: r.entity_id, decision: JSON.parse(r.decision), at: r.at })) });
});

app.put("/api/reviews/:entityId", async (c) => {
  const decision = await c.req.json<ReviewDecision>().catch(() => null);
  if (!decision || !["yes", "no", "none", "alt", "fix", "hide"].includes((decision as { d?: string }).d ?? "")) return c.json({ error: "decision must have d: yes|no|none|alt|fix|hide" }, 400);
  const review = { entityId: c.req.param("entityId"), decision, at: Date.now() };
  await c.env.DB.prepare(UPSERT_REVIEW).bind(review.entityId, JSON.stringify(decision), review.at).run();
  return c.json(review);
});

// ---------- settings ----------

app.get("/api/prefs", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT key, value FROM prefs").all<{ key: string; value: string }>();
  return c.json(Object.fromEntries(results.map((r) => [r.key, JSON.parse(r.value)])));
});

app.put("/api/prefs/:key", async (c) => {
  const value = await c.req.json().catch(() => undefined);
  if (value === undefined) return c.json({ error: "send JSON" }, 400);
  await c.env.DB.prepare("INSERT INTO prefs (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
    .bind(c.req.param("key"), JSON.stringify(value), Date.now()).run();
  return c.json({ ok: true });
});

// ---------- enricher by hand ----------

app.post("/api/enrich/run", async (c) => c.json({ items: await runEnrichQueue(c.env), shows: await refreshShows(c.env) }));

app.notFound((c) => c.json({ error: "not found" }, 404));
app.onError((err, c) => { console.error(err); return c.json({ error: "server error" }, 500); });

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      const items = await runEnrichQueue(env);
      const shows = await refreshShows(env);
      console.log(JSON.stringify({ cron: "enrich", items, shows }));
    })());
  },
} satisfies ExportedHandler<Env>;
