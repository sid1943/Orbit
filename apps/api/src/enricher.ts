import { enrichItem, nextCheckAfter, tvmazeStatus, type Entity, type Fetch, type Item } from "@orbit/core";
import { type Env, UPSERT_COVER, UPSERT_ENTITY, UPSERT_ITEM, UPSERT_LIVE, entityRow, itemRow, parse } from "./db.js";

/**
 * Free Workers allow 50 outside requests and 50 database queries per run, so each run
 * (every 10 minutes) does a small batch: about 1,150 items and 575 show checks a day.
 */
const ITEMS_PER_RUN = 8;   // up to 3 outside requests and 4 queries each
const SHOWS_PER_RUN = 4;   // 2 outside requests and 2 queries each
const HOUR = 3_600_000;

const workerFetch: Fetch = (url, init) => fetch(url, init);

export async function enqueue(env: Env, itemId: string, now = Date.now()): Promise<void> {
  await env.DB.prepare(`INSERT INTO enrich_queue (item_id, mode, attempts, not_before, created_at) VALUES (?, 'new', 0, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET mode='new', attempts=0, not_before=excluded.not_before, last_error=NULL`).bind(itemId, now, now).run();
}

/** Link newly added items to their real-world thing. */
export async function runEnrichQueue(env: Env, now = Date.now()): Promise<{ done: number; failed: number }> {
  // Cards Sid just added go first; the back-fill of old cards fills the remaining slots.
  const { results } = await env.DB.prepare(`SELECT q.item_id, q.attempts, q.mode, i.data FROM enrich_queue q JOIN items i ON i.id = q.item_id
    WHERE q.not_before <= ? ORDER BY q.mode = 'backfill', q.created_at LIMIT ?`).bind(now, ITEMS_PER_RUN).all<{ item_id: string; attempts: number; mode: string; data: string }>();
  let done = 0, failed = 0;
  for (const row of results) {
    const item = parse<Item>(row)!;
    try {
      if (item.entityId || item.deleted) { await env.DB.prepare(`DELETE FROM enrich_queue WHERE item_id = ?`).bind(item.id).run(); continue; }
      const r = await enrichItem(workerFetch, item, { strict: row.mode === "backfill" });
      const stmts: D1PreparedStatement[] = [env.DB.prepare(`DELETE FROM enrich_queue WHERE item_id = ?`).bind(item.id)];
      if (r.entity) {
        const entity: Entity = { ...r.entity, id: `ent_${crypto.randomUUID()}`, updatedAt: now, ...(r.alternatives.length ? { alternatives: r.alternatives } : {}) };
        const updated: Item = { ...item, entityId: entity.id, updatedAt: now };
        stmts.push(env.DB.prepare(UPSERT_ENTITY).bind(...entityRow(entity)), env.DB.prepare(UPSERT_ITEM).bind(...itemRow(updated)));
        if (r.coverUrl) stmts.push(env.DB.prepare(UPSERT_COVER).bind(entity.id, r.coverUrl, new URL(r.coverUrl).hostname, now));
      }
      await env.DB.batch(stmts);
      done++;
    } catch (err) {
      failed++;
      const attempts = row.attempts + 1;
      // Back off 1h, 2h, 4h... and give up after 6 tries (the item stays unlinked and shows up for review).
      const stmt = attempts >= 6
        ? env.DB.prepare(`DELETE FROM enrich_queue WHERE item_id = ?`).bind(item.id)
        : env.DB.prepare(`UPDATE enrich_queue SET attempts = ?, not_before = ?, last_error = ? WHERE item_id = ?`).bind(attempts, now + HOUR * 2 ** (attempts - 1), String(err).slice(0, 500), item.id);
      await stmt.run();
    }
  }
  return { done, failed };
}

/** Refresh live status for the TV shows that are due a check. */
export async function refreshShows(env: Env, now = Date.now()): Promise<{ checked: number; failed: number }> {
  const { results } = await env.DB.prepare(`SELECT e.id, e.imdb FROM entities e LEFT JOIN live l ON l.entity_id = e.id
    WHERE e.category = 'show' AND e.imdb IS NOT NULL AND e.confidence IN ('high','user') AND (l.next_check IS NULL OR l.next_check <= ?)
    ORDER BY COALESCE(l.next_check, 0) LIMIT ?`).bind(now, SHOWS_PER_RUN).all<{ id: string; imdb: string }>();
  let checked = 0, failed = 0;
  for (const s of results) {
    try {
      const r = await tvmazeStatus(workerFetch, s.imdb, now);
      if (!r) {
        // TVmaze doesn't know it: note that and look again in a month.
        await env.DB.prepare(UPSERT_LIVE).bind(s.id, "tvmaze", JSON.stringify({ entityId: s.id, source: "tvmaze", checkedAt: now }), now, now + 30 * 24 * HOUR).run();
      } else {
        const live = { entityId: s.id, ...r.live };
        const stmts = [env.DB.prepare(UPSERT_LIVE).bind(s.id, "tvmaze", JSON.stringify(live), now, now + nextCheckAfter(live))];
        if (r.coverUrl) stmts.push(env.DB.prepare(`INSERT INTO covers (entity_id, url, source, fetched_at) VALUES (?, ?, 'tvmaze', ?) ON CONFLICT(entity_id) DO NOTHING`).bind(s.id, r.coverUrl, now));
        await env.DB.batch(stmts);
      }
      checked++;
    } catch {
      failed++;
      // Keep what we knew; just try again in 6 hours.
      await env.DB.prepare(`INSERT INTO live (entity_id, source, data, checked_at, next_check) VALUES (?, 'tvmaze', ?, ?, ?)
        ON CONFLICT(entity_id) DO UPDATE SET next_check = excluded.next_check`)
        .bind(s.id, JSON.stringify({ entityId: s.id, source: "tvmaze", checkedAt: now }), now, now + 6 * HOUR).run();
    }
  }
  return { checked, failed };
}
