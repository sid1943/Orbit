import { nextCheckAfter, tvmazeStatus } from "@orbit/core";
import { UPSERT_LIVE, withReview, type EntityReviewRow } from "../db/statements.js";
import type { Env } from "../env.js";
import { HOUR, workerFetch } from "./shared.js";

/** 2 outside requests and 2 queries per show (see jobs/shared.ts for the per-run budget). */
const SHOWS_PER_RUN = 4;

/** Refresh live status for the TV shows that are due a check. */
export async function refreshShows(env: Env, now = Date.now()): Promise<{ checked: number; failed: number }> {
  // Sid's review answers count: a confirmed guess is checked, a rejected one is not.
  const { results: rows } = await env.DB.prepare(
    `SELECT e.data, rv.decision FROM entities e LEFT JOIN live l ON l.entity_id = e.id LEFT JOIN reviews rv ON rv.entity_id = e.id
    WHERE e.category = 'show'
      AND (
        (e.confidence IN ('high','user') AND (rv.entity_id IS NULL
          OR json_extract(rv.decision, '$.d') IN ('yes','hide')
          OR (json_extract(rv.decision, '$.d') = 'fix' AND json_extract(rv.decision, '$.add') = 1)))
        OR json_extract(rv.decision, '$.d') IN ('yes','alt')
      )
      AND (l.next_check IS NULL OR l.next_check <= ?)
    ORDER BY COALESCE(l.next_check, 0) LIMIT ?`,
  )
    .bind(now, SHOWS_PER_RUN * 2)
    .all<EntityReviewRow>();
  const results = rows
    .map(withReview)
    .filter((e) => e.imdb && (e.confidence === "high" || e.confidence === "user"))
    .slice(0, SHOWS_PER_RUN)
    .map((e) => ({ id: e.id, imdb: e.imdb! }));
  let checked = 0,
    failed = 0;
  for (const s of results) {
    try {
      const r = await tvmazeStatus(workerFetch, s.imdb, now);
      if (!r) {
        // TVmaze doesn't know it: note that and look again in a month.
        await env.DB.prepare(UPSERT_LIVE)
          .bind(
            s.id,
            "tvmaze",
            JSON.stringify({ entityId: s.id, source: "tvmaze", checkedAt: now }),
            now,
            now + 30 * 24 * HOUR,
          )
          .run();
      } else {
        const live = { entityId: s.id, ...r.live };
        const stmts = [
          env.DB.prepare(UPSERT_LIVE).bind(s.id, "tvmaze", JSON.stringify(live), now, now + nextCheckAfter(live)),
        ];
        if (r.coverUrl)
          stmts.push(
            env.DB.prepare(
              `INSERT INTO covers (entity_id, url, source, fetched_at) VALUES (?, ?, 'tvmaze', ?) ON CONFLICT(entity_id) DO NOTHING`,
            ).bind(s.id, r.coverUrl, now),
          );
        await env.DB.batch(stmts);
      }
      checked++;
    } catch {
      failed++;
      // Keep what we knew; just try again in 6 hours.
      await env.DB.prepare(
        `INSERT INTO live (entity_id, source, data, checked_at, next_check) VALUES (?, 'tvmaze', ?, ?, ?)
        ON CONFLICT(entity_id) DO UPDATE SET next_check = excluded.next_check`,
      )
        .bind(s.id, JSON.stringify({ entityId: s.id, source: "tvmaze", checkedAt: now }), now, now + 6 * HOUR)
        .run();
    }
  }
  return { checked, failed };
}
