import { enrichItem, type Entity, type Item } from "@orbit/core";
import { UPSERT_COVER, UPSERT_ENTITY, UPSERT_ITEM, entityRow, itemRow, parse } from "../db/statements.js";
import type { Env } from "../env.js";
import { HOUR, workerFetch } from "./shared.js";

/** Up to 3 outside requests and 4 queries per card (see jobs/shared.ts for the per-run budget). */
const ITEMS_PER_RUN = 8;

/** Queue a card for linking. Re-queuing resets its retries. */
export async function enqueue(env: Env, itemId: string, now = Date.now()): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO enrich_queue (item_id, mode, attempts, not_before, created_at) VALUES (?, 'new', 0, ?, ?)
    ON CONFLICT(item_id) DO UPDATE SET mode='new', attempts=0, not_before=excluded.not_before, last_error=NULL`,
  )
    .bind(itemId, now, now)
    .run();
}

/** Link newly added items to their real-world thing. */
export async function runEnrichQueue(env: Env, now = Date.now()): Promise<{ done: number; failed: number }> {
  // Cards Sid just added go first; the back-fill of old cards fills the remaining slots.
  const { results } = await env.DB.prepare(
    `SELECT q.item_id, q.attempts, q.mode, i.data FROM enrich_queue q JOIN items i ON i.id = q.item_id
    WHERE q.not_before <= ? ORDER BY q.mode = 'backfill', q.created_at LIMIT ?`,
  )
    .bind(now, ITEMS_PER_RUN)
    .all<{ item_id: string; attempts: number; mode: string; data: string }>();
  let done = 0,
    failed = 0;
  for (const row of results) {
    const item = parse<Item>(row)!;
    try {
      if (item.entityId || item.deleted) {
        await env.DB.prepare(`DELETE FROM enrich_queue WHERE item_id = ?`).bind(item.id).run();
        continue;
      }
      const r = await enrichItem(workerFetch, item, { strict: row.mode === "backfill" });
      const stmts: D1PreparedStatement[] = [env.DB.prepare(`DELETE FROM enrich_queue WHERE item_id = ?`).bind(item.id)];
      if (r.entity) {
        const entity: Entity = {
          ...r.entity,
          id: `ent_${crypto.randomUUID()}`,
          updatedAt: now,
          ...(r.alternatives.length ? { alternatives: r.alternatives } : {}),
        };
        const updated: Item = { ...item, entityId: entity.id, updatedAt: now };
        stmts.push(
          env.DB.prepare(UPSERT_ENTITY).bind(...entityRow(entity)),
          env.DB.prepare(UPSERT_ITEM).bind(...itemRow(updated)),
        );
        if (r.coverUrl)
          stmts.push(env.DB.prepare(UPSERT_COVER).bind(entity.id, r.coverUrl, new URL(r.coverUrl).hostname, now));
      }
      await env.DB.batch(stmts);
      done++;
    } catch (err) {
      failed++;
      const attempts = row.attempts + 1;
      // Back off 1h, 2h, 4h... and give up after 6 tries (the item stays unlinked and shows up for review).
      const stmt =
        attempts >= 6
          ? env.DB.prepare(`DELETE FROM enrich_queue WHERE item_id = ?`).bind(item.id)
          : env.DB.prepare(
              `UPDATE enrich_queue SET attempts = ?, not_before = ?, last_error = ? WHERE item_id = ?`,
            ).bind(attempts, now + HOUR * 2 ** (attempts - 1), String(err).slice(0, 500), item.id);
      await stmt.run();
    }
  }
  return { done, failed };
}
