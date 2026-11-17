import {
  WIKIDATA_BATCH,
  afterCheck,
  openLibraryPublished,
  ownerState,
  requestsFor,
  tvmazeStatus,
  watchRule,
  wikidataDates,
  type CheckOutcome,
  type LiveStatus,
  type WatchOwner,
  type WatchSource,
  type WatchWhat,
} from "@orbit/core";
import { IN_JSON, withReview, type EntityReviewRow } from "../db/statements.js";
import type { Env } from "../env.js";
import { type Budget, LINK_RESERVE } from "./shared.js";

/**
 * Live watch: one scheduler for everything that can change out there (shows, release dates,
 * publication dates, places closing). The rules are in `packages/core/src/watch.ts`; this file
 * only works them out for each linked thing and spends the cron budget on whatever is due.
 */

/** Linked things whose rule is worked out per run (no outside requests; 3 database calls). */
const PLAN_PER_RUN = 200;
/** Due checks looked at per run. */
const DUE_PER_RUN = 120;

/** The time of the last run's start, kept in `job_state` (see `CHANGES` in jobs/index.ts). */
export const SINCE = `COALESCE((SELECT CAST(value AS INTEGER) FROM job_state WHERE key = 'changes_since'), 0)`;

/**
 * Marks for re-planning every linked thing whose card, checklist row, review answer or own record
 * changed since the last run. New linked things get their first row here.
 */
export const MARK_CHANGED = `INSERT INTO watch (entity_id, replan)
  SELECT id, 1 FROM (
    SELECT id FROM entities WHERE updated_at >= ${SINCE}
    UNION SELECT entity_id FROM items WHERE updated_at >= ${SINCE} AND entity_id IS NOT NULL
    UNION SELECT json_extract(r.value, '$.entityId') FROM items i, json_each(i.data, '$.checklists') c, json_each(c.value, '$.rows') r
      WHERE i.updated_at >= ${SINCE} AND json_extract(r.value, '$.entityId') IS NOT NULL
    UNION SELECT entity_id FROM reviews WHERE at >= ${SINCE}
  ) WHERE id IN (SELECT id FROM entities)
  ON CONFLICT(entity_id) DO UPDATE SET replan = 1`;

/** Everything pointing at the linked things in ?1 (a JSON list): cards, and checklist rows with their tick. */
const OWNERS = `SELECT entity_id AS eid, status, archived, deleted, NULL AS row_done FROM items WHERE entity_id IN (${IN_JSON.replace("?", "?1")})
  UNION ALL
  SELECT json_extract(r.value, '$.entityId'), i.status, i.archived, i.deleted, json_extract(r.value, '$.done')
  FROM items i, json_each(i.data, '$.checklists') c, json_each(c.value, '$.rows') r
  WHERE json_extract(r.value, '$.entityId') IN (${IN_JSON.replace("?", "?1")})`;

/**
 * Saves new plans (?1: JSON list of `{ id, what, source, key, next, stop }`).
 * If the source and id didn't change, a watch that was already scheduled keeps its date (editing a
 * card doesn't trigger a check) and its TVmaze id; otherwise it is checked on the next run.
 */
const SAVE_PLANS = `INSERT INTO watch (entity_id, what, source, key, next_check, stop, replan)
  SELECT json_extract(j.value, '$.id'), json_extract(j.value, '$.what'), json_extract(j.value, '$.source'),
    json_extract(j.value, '$.key'), json_extract(j.value, '$.next'), json_extract(j.value, '$.stop'), 0
  FROM json_each(?1) j WHERE true
  ON CONFLICT(entity_id) DO UPDATE SET
    next_check = CASE
      WHEN excluded.next_check IS NULL THEN NULL
      WHEN watch.key IS excluded.key AND watch.source IS excluded.source AND watch.next_check IS NOT NULL THEN watch.next_check
      ELSE excluded.next_check END,
    ref = CASE WHEN watch.key IS excluded.key THEN watch.ref ELSE NULL END,
    misses = CASE WHEN watch.key IS excluded.key THEN watch.misses ELSE 0 END,
    what = excluded.what, source = excluded.source, key = excluded.key, stop = excluded.stop, replan = 0`;

/** Saves check results (?1: JSON list of `{ id, next, stop, misses, ref }`, ?2: now). Skips rows re-planned meanwhile. */
const SAVE_CHECKS = `UPDATE watch SET
    next_check = json_extract(j.value, '$.next'), stop = json_extract(j.value, '$.stop'),
    misses = json_extract(j.value, '$.misses'), ref = COALESCE(json_extract(j.value, '$.ref'), watch.ref), checked_at = ?2
  FROM json_each(?1) j WHERE watch.entity_id = json_extract(j.value, '$.id') AND watch.replan = 0`;

/** Saves what was found (?1: JSON list of `{ id, source, data, next }`, ?2: now) where the pages read it (`/api/live`). */
const SAVE_LIVE = `INSERT INTO live (entity_id, source, data, checked_at, next_check)
  SELECT json_extract(j.value, '$.id'), json_extract(j.value, '$.source'), json_extract(j.value, '$.data'), ?2,
    COALESCE(json_extract(j.value, '$.next'), 0)
  FROM json_each(?1) j WHERE true
  ON CONFLICT(entity_id) DO UPDATE SET source = excluded.source, data = excluded.data,
    checked_at = excluded.checked_at, next_check = excluded.next_check`;

/** Covers found on the way (?1: JSON list of `{ id, url, source }`, ?2: now). An existing cover is kept. */
const SAVE_COVERS = `INSERT INTO covers (entity_id, url, source, fetched_at)
  SELECT json_extract(j.value, '$.id'), json_extract(j.value, '$.url'), json_extract(j.value, '$.source'), ?2
  FROM json_each(?1) j WHERE true
  ON CONFLICT(entity_id) DO NOTHING`;

interface PlanRow extends EntityReviewRow {
  id: string;
}
interface OwnerRow {
  eid: string;
  status: string;
  archived: number;
  deleted: number;
  row_done: number | null;
}
interface DueRow {
  entity_id: string;
  what: WatchWhat;
  source: WatchSource;
  key: string;
  ref: string | null;
  misses: number;
}

export interface WatchRunResult {
  planned: number;
  checked: number;
  stopped: number;
  failed: number;
  /** Due checks left for a later run because the budget ran out. */
  waiting: number;
}

/** Works out the rule for linked things that are new or changed. 3 database calls, no outside requests. */
export async function planWatch(env: Env, budget: Budget, now = Date.now()): Promise<number> {
  if (!budget.has(3)) return 0;
  budget.db();
  const { results: rows } = await env.DB.prepare(
    `SELECT w.entity_id AS id, e.data, rv.decision FROM watch w JOIN entities e ON e.id = w.entity_id
    LEFT JOIN reviews rv ON rv.entity_id = w.entity_id WHERE w.replan = 1 LIMIT ?`,
  )
    .bind(PLAN_PER_RUN)
    .all<PlanRow>();
  if (!rows.length) return 0;
  budget.db();
  const { results: owners } = await env.DB.prepare(OWNERS)
    .bind(JSON.stringify(rows.map((r) => r.id)))
    .all<OwnerRow>();
  const byEntity = new Map<string, WatchOwner[]>();
  for (const o of owners) {
    const list = byEntity.get(o.eid) ?? [];
    list.push({
      status: o.status,
      archived: !!o.archived,
      deleted: !!o.deleted,
      ...(o.row_done !== null ? { rowDone: !!o.row_done } : {}),
    });
    byEntity.set(o.eid, list);
  }
  const plans = rows.map((r) => {
    const plan = watchRule(withReview(r), ownerState(byEntity.get(r.id) ?? []), now);
    return { id: r.id, ...plan, next: plan.stop ? null : now };
  });
  budget.db();
  await env.DB.prepare(SAVE_PLANS).bind(JSON.stringify(plans)).run();
  return plans.length;
}

/** Checks what is due, as far as the budget allows. 2 database calls plus the outside requests. */
export async function checkDue(env: Env, budget: Budget, now = Date.now()): Promise<Omit<WatchRunResult, "planned">> {
  const none = { checked: 0, stopped: 0, failed: 0, waiting: 0 };
  // Keep 1 call to save, and the dead-link check's share (its 2 calls and LINK_RESERVE requests).
  const keep = 1 + 2 + LINK_RESERVE;
  if (!budget.has(1 + keep + 1)) return none;
  budget.db();
  const { results: due } = await env.DB.prepare(
    `SELECT entity_id, what, source, key, ref, misses FROM watch
    WHERE next_check IS NOT NULL AND next_check <= ? AND replan = 0 ORDER BY next_check LIMIT ?`,
  )
    .bind(now, DUE_PER_RUN)
    .all<DueRow>();
  if (!due.length) return none;

  const outcomes = new Map<string, CheckOutcome & { ref?: string; cover?: string }>();
  const canSpend = (n: number) => budget.left - keep >= n;

  // Wikidata first: one request answers up to 50.
  const wd = due.filter((d) => d.source === "wikidata");
  for (let i = 0; i < wd.length && canSpend(1); i += WIKIDATA_BATCH) {
    const batch = wd.slice(i, i + WIKIDATA_BATCH);
    try {
      const dates = await wikidataDates(
        budget.fetch,
        batch.map((d) => d.key),
      );
      for (const d of batch) {
        const got = dates.get(d.key);
        if (!got) outcomes.set(d.entity_id, { unknown: true });
        else
          outcomes.set(d.entity_id, {
            found: {
              source: "wikidata",
              ...(got.released ? { releaseDate: got.released } : {}),
              ...(got.closed ? { closed: got.closed } : {}),
              checkedAt: now,
            },
          });
      }
    } catch (err) {
      for (const d of batch) outcomes.set(d.entity_id, { error: String(err) });
    }
  }

  // Then one by one, in the order they fell due.
  for (const d of due) {
    if (d.source === "wikidata") continue;
    const cost = requestsFor(d.source, !!d.ref);
    if (!canSpend(cost)) continue; // a cheaper one further down may still fit
    try {
      if (d.source === "tvmaze") {
        const r = await tvmazeStatus(budget.fetch, d.key, now, d.ref ? Number(d.ref) : undefined);
        outcomes.set(
          d.entity_id,
          r
            ? { found: r.live, ref: String(r.tvmazeId), ...(r.coverUrl ? { cover: r.coverUrl } : {}) }
            : { unknown: true },
        );
      } else {
        const r = await openLibraryPublished(budget.fetch, d.key);
        outcomes.set(d.entity_id, r ? { found: { source: "openlibrary", ...r, checkedAt: now } } : { unknown: true });
      }
    } catch (err) {
      outcomes.set(d.entity_id, { error: String(err) });
    }
  }
  if (!outcomes.size) return { ...none, waiting: due.length };

  const checks: { id: string; next: number | null; stop: string | null; misses: number; ref?: string }[] = [];
  const live: { id: string; source: string; data: string; next: number | null }[] = [];
  const covers: { id: string; url: string; source: string }[] = [];
  let stopped = 0,
    failed = 0;
  for (const d of due) {
    const o = outcomes.get(d.entity_id);
    if (!o) continue;
    const n = afterCheck(d.what, o, d.misses, now);
    checks.push({ id: d.entity_id, next: n.next, stop: n.stop, misses: n.misses, ...(o.ref ? { ref: o.ref } : {}) });
    if (n.stop) stopped++;
    if ("error" in o) failed++;
    if ("found" in o) {
      const status: LiveStatus = { entityId: d.entity_id, ...o.found };
      live.push({ id: d.entity_id, source: status.source, data: JSON.stringify(status), next: n.next });
    }
    if (o.cover) covers.push({ id: d.entity_id, url: o.cover, source: "tvmaze" });
  }
  const stmts = [env.DB.prepare(SAVE_CHECKS).bind(JSON.stringify(checks), now)];
  if (live.length) stmts.push(env.DB.prepare(SAVE_LIVE).bind(JSON.stringify(live), now));
  if (covers.length) stmts.push(env.DB.prepare(SAVE_COVERS).bind(JSON.stringify(covers), now));
  budget.db();
  await env.DB.batch(stmts);
  return { checked: checks.length, stopped, failed, waiting: due.length - checks.length };
}

/** Plan what's new, then check what's due. */
export async function runLiveWatch(env: Env, budget: Budget, now = Date.now()): Promise<WatchRunResult> {
  const planned = await planWatch(env, budget, now);
  return { planned, ...(await checkDue(env, budget, now)) };
}
