import {
  IGDB_BATCH,
  WIKIDATA_BATCH,
  afterCheck,
  igdbGames,
  tmdbCollection,
  tmdbFind,
  tmdbMovie,
  tmdbTvWatch,
  tokenUsable,
  twitchToken,
  type TwitchToken,
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
import { keyedSources, type Env } from "../env.js";
import { CITY_RESERVE } from "./city-guide.js";
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
/** TMDB answers are big (every country's dates and offers); a few per run keeps within 10 ms of CPU. */
const TMDB_PER_RUN = 8;

/** Ids a source gave us, kept in `watch.ref` so the next check skips the lookup. */
interface Refs {
  tvmaze?: number;
  tmdb?: number;
}
const readRefs = (ref: string | null): Refs => {
  if (!ref) return {};
  try {
    const r = JSON.parse(ref) as unknown;
    return typeof r === "number" ? { tvmaze: r } : (r as Refs);
  } catch {
    return {};
  }
};

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
  const keys = keyedSources(env);
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
    const plan = watchRule(withReview(r), ownerState(byEntity.get(r.id) ?? []), now, keys);
    return { id: r.id, ...plan, next: plan.stop ? null : now };
  });
  budget.db();
  await env.DB.prepare(SAVE_PLANS).bind(JSON.stringify(plans)).run();
  return plans.length;
}

/** Checks what is due, as far as the budget allows. 2 database calls plus the outside requests. */
export async function checkDue(env: Env, budget: Budget, now = Date.now()): Promise<Omit<WatchRunResult, "planned">> {
  const none = { checked: 0, stopped: 0, failed: 0, waiting: 0 };
  // Keep 1 call to save, the city rule's share, and the dead-link check's (its 2 calls and LINK_RESERVE requests).
  const keep = 1 + CITY_RESERVE + 2 + LINK_RESERVE;
  if (!budget.has(1 + keep + 1)) return none;
  budget.db();
  const { results: due } = await env.DB.prepare(
    `SELECT entity_id, what, source, key, ref, misses FROM watch
    WHERE next_check IS NOT NULL AND next_check <= ? AND replan = 0 ORDER BY next_check LIMIT ?`,
  )
    .bind(now, DUE_PER_RUN)
    .all<DueRow>();
  if (!due.length) return none;

  const outcomes = new Map<string, CheckOutcome & { ref?: string; cover?: string; coverSource?: string }>();
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

  // IGDB: one request answers up to 50 games, with a token kept between runs.
  const games = due.filter((d) => d.source === "igdb");
  let newToken: TwitchToken | null = null;
  if (games.length && env.IGDB_CLIENT_ID && env.IGDB_CLIENT_SECRET && canSpend(2)) {
    budget.db();
    const saved = await env.DB.prepare(`SELECT value FROM job_state WHERE key = 'igdb_token'`).first<string>("value");
    let token: TwitchToken | null = saved ? (JSON.parse(saved) as TwitchToken) : null;
    try {
      if (!tokenUsable(token, now)) {
        token = newToken = await twitchToken(budget.fetch, env.IGDB_CLIENT_ID, env.IGDB_CLIENT_SECRET, now);
      }
      for (let i = 0; i < games.length && canSpend(1); i += IGDB_BATCH) {
        const batch = games.slice(i, i + IGDB_BATCH);
        try {
          const found = await igdbGames(
            budget.fetch,
            env.IGDB_CLIENT_ID,
            token!.token,
            batch.map((d) => d.key),
            now,
          );
          for (const d of batch) {
            const f = found.get(d.key);
            outcomes.set(d.entity_id, f ? { found: f } : { unknown: true });
          }
        } catch (err) {
          for (const d of batch) outcomes.set(d.entity_id, { error: String(err) });
        }
      }
    } catch (err) {
      for (const d of games) outcomes.set(d.entity_id, { error: String(err) });
    }
  }

  // Then one by one, in the order they fell due.
  const keys = keyedSources(env);
  let tmdbChecks = 0;
  for (const d of due) {
    if (d.source === "wikidata" || d.source === "igdb") continue;
    const refs = readRefs(d.ref);
    const cost = requestsFor(d.source, d.source === "tmdb" ? !!refs.tmdb : !!refs.tvmaze, keys);
    if (!canSpend(cost)) continue; // a cheaper one further down may still fit
    try {
      if (d.source === "tvmaze") {
        const r = await tvmazeStatus(budget.fetch, d.key, now, refs.tvmaze);
        if (!r) {
          outcomes.set(d.entity_id, { unknown: true });
          continue;
        }
        const next: Refs = { ...refs, tvmaze: r.tvmazeId };
        let live = r.live;
        if (env.TMDB_TOKEN && tmdbChecks < TMDB_PER_RUN) {
          tmdbChecks++;
          try {
            next.tmdb ??= (await tmdbFind(budget.fetch, env.TMDB_TOKEN, d.key)).tv;
            const watchOn = next.tmdb ? await tmdbTvWatch(budget.fetch, env.TMDB_TOKEN, next.tmdb) : undefined;
            if (watchOn)
              live = {
                ...live,
                watchOn: { ...watchOn, ...(live.watchOn?.network ? { network: live.watchOn.network } : {}) },
              };
          } catch {
            // TVmaze's answer still counts; where to watch is filled in next time.
          }
        }
        outcomes.set(d.entity_id, {
          found: live,
          ref: JSON.stringify(next),
          ...(r.coverUrl ? { cover: r.coverUrl } : {}),
        });
      } else if (d.source === "tmdb") {
        if (!env.TMDB_TOKEN || tmdbChecks >= TMDB_PER_RUN) continue;
        tmdbChecks++;
        const id = refs.tmdb ?? (await tmdbFind(budget.fetch, env.TMDB_TOKEN, d.key)).movie;
        const m = id ? await tmdbMovie(budget.fetch, env.TMDB_TOKEN, id, now) : null;
        if (!m) {
          outcomes.set(d.entity_id, { unknown: true });
          continue;
        }
        let live = m.live;
        if (m.collectionId && canSpend(1)) {
          const c = await tmdbCollection(budget.fetch, env.TMDB_TOKEN, m.collectionId).catch(() => null);
          if (c) live = { ...live, collection: c };
        }
        outcomes.set(d.entity_id, {
          found: live,
          ref: JSON.stringify({ tmdb: id }),
          ...(m.posterUrl ? { cover: m.posterUrl, coverSource: "tmdb" } : {}),
        });
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
    if (o.cover) covers.push({ id: d.entity_id, url: o.cover, source: o.coverSource ?? "tvmaze" });
  }
  const stmts = [env.DB.prepare(SAVE_CHECKS).bind(JSON.stringify(checks), now)];
  if (live.length) stmts.push(env.DB.prepare(SAVE_LIVE).bind(JSON.stringify(live), now));
  if (covers.length) stmts.push(env.DB.prepare(SAVE_COVERS).bind(JSON.stringify(covers), now));
  if (newToken)
    stmts.push(
      env.DB.prepare(
        `INSERT INTO job_state (key, value) VALUES ('igdb_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).bind(JSON.stringify(newToken)),
    );
  budget.db();
  await env.DB.batch(stmts);
  return { checked: checks.length, stopped, failed, waiting: due.length - checks.length };
}

/** Plan what's new, then check what's due. */
export async function runLiveWatch(env: Env, budget: Budget, now = Date.now()): Promise<WatchRunResult> {
  const planned = await planWatch(env, budget, now);
  return { planned, ...(await checkDue(env, budget, now)) };
}
