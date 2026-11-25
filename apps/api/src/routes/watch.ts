import { STOP_LABELS, pastedLinks, type Item, type StopReason } from "@orbit/core";
import { Hono } from "hono";
import { CARD_ENTITY_IDS, parse } from "../db/statements.js";
import type { AppEnv } from "../env.js";

export const watch = new Hono<AppEnv>();

/**
 * How live watch and the dead-link check stand: what is watched, what stopped and why, what is due,
 * and links by state. For Settings and for checking the cron keeps up.
 */
watch.get("/", async (c) => {
  const db = c.env.DB;
  const now = Date.now();
  const [plans, links, since] = await db.batch<Record<string, string | number | null>>([
    db
      .prepare(
        `SELECT COALESCE(what, 'unplanned') AS what, stop, COUNT(*) AS n,
        SUM(CASE WHEN next_check IS NOT NULL AND next_check <= ?1 THEN 1 ELSE 0 END) AS due
      FROM watch GROUP BY 1, 2`,
      )
      .bind(now),
    db
      .prepare(
        `SELECT state, COUNT(*) AS n, SUM(CASE WHEN next_check IS NOT NULL AND next_check <= ?1 THEN 1 ELSE 0 END) AS due
      FROM link_checks GROUP BY state`,
      )
      .bind(now),
    db.prepare(`SELECT value FROM job_state WHERE key = 'changes_since'`),
  ]);
  const watched: Record<string, { watching: number; due: number; stopped: Record<string, number> }> = {};
  for (const r of plans?.results ?? []) {
    const w = (watched[String(r.what)] ??= { watching: 0, due: 0, stopped: {} });
    if (r.stop) w.stopped[String(r.stop)] = Number(r.n);
    else w.watching += Number(r.n);
    w.due += Number(r.due ?? 0);
  }
  return c.json({
    watched,
    links: Object.fromEntries((links?.results ?? []).map((r) => [r.state, { count: Number(r.n), due: Number(r.due) }])),
    lastRun: since?.results?.[0]?.value ? Number(since.results[0].value) : null,
    stopLabels: STOP_LABELS satisfies Record<StopReason, string>,
  });
});

interface LinkRow {
  url: string;
  owner: string;
  state: string;
  http_status: number | null;
  checked_at: number | null;
  title?: string | null;
}
const linkOut = (r: LinkRow) => ({
  url: r.url,
  state: r.state,
  httpStatus: r.http_status,
  checkedAt: r.checked_at,
  ...(r.title !== undefined ? { owner: r.owner, title: r.title } : {}),
});

/**
 * Pasted links and how their last check went.
 * `?item=<card id>`: that card's Useful links and attachments, and the "Fix links" addresses of its linked things.
 * `?state=dead` (or `unsure`, `blocked`, `ok`, `new`): every link in that state, with the card it is on.
 */
watch.get("/links", async (c) => {
  const db = c.env.DB;
  const itemId = c.req.query("item");
  const state = c.req.query("state");
  if (itemId) {
    const item = parse<Item>(await db.prepare(`SELECT data FROM items WHERE id = ?`).bind(itemId).first());
    if (!item) return c.json({ error: "not found" }, 404);
    const { results: fixed } = await db
      .prepare(
        `${CARD_ENTITY_IDS} SELECT json_extract(rv.decision, '$.url') AS url FROM reviews rv JOIN ids ON ids.id = rv.entity_id
        WHERE json_extract(rv.decision, '$.d') = 'fix' AND json_extract(rv.decision, '$.url') IS NOT NULL`,
      )
      .bind(itemId)
      .all<{ url: string }>();
    const urls = [...new Set([...pastedLinks(item), ...fixed.map((f) => f.url)])];
    if (!urls.length) return c.json({ links: [] });
    const { results } = await db
      .prepare(
        `SELECT url, owner, state, http_status, checked_at FROM link_checks WHERE url IN (SELECT value FROM json_each(?))`,
      )
      .bind(JSON.stringify(urls))
      .all<LinkRow>();
    const known = new Map(results.map((r) => [r.url, r]));
    return c.json({
      links: urls.map((url) =>
        linkOut(known.get(url) ?? { url, owner: itemId, state: "new", http_status: null, checked_at: null }),
      ),
    });
  }
  const states = ["new", "ok", "unsure", "blocked", "dead", "skipped"];
  if (!state || !states.includes(state))
    return c.json({ error: `give item=<card id> or state=${states.join("|")}` }, 400);
  const { results } = await db
    .prepare(
      `SELECT l.url, l.owner, l.state, l.http_status, l.checked_at, i.title FROM link_checks l
      LEFT JOIN items i ON i.id = l.owner WHERE l.state = ? ORDER BY l.checked_at DESC LIMIT 2000`,
    )
    .bind(state)
    .all<LinkRow>();
  return c.json({ links: results.map((r) => linkOut({ ...r, title: r.title ?? null })) });
});
