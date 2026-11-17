import {
  qidsByExternalId,
  relationsOf,
  seriesMembers,
  seriesOf,
  worksByQid,
  type Entity,
  type Relation,
} from "@orbit/core";
import { UPSERT_ENTITY, entityRow } from "../db/statements.js";
import type { Env } from "../env.js";
import { HOUR, workerFetch } from "./shared.js";

/** Linked things whose Wikidata id is looked up per run (one outside request per kind of id). */
const MAP_PER_RUN = 200;
/** Linked things connected per run: 2 queries, plus one per 200 new connected things. */
const CONNECT_PER_RUN = 50;
const DAY = 24 * HOUR;
/** Connections hardly change; look again monthly (the watch rules may ask sooner). */
export const RECONNECT_AFTER = 30 * DAY;
/** No Wikidata id found: try again in three months (Wikidata grows). */
const RETRY_MISSING_AFTER = 90 * DAY;
/** A work's name and year are read again after this long. */
const WORK_STALE_AFTER = 90 * DAY;

/** Categories that can have series, sequels and adaptations. */
const CATEGORIES = "('movie','show','book','game')";
const SURE = "('high','user')";

// `WHERE true` lets SQLite tell the upsert's ON CONFLICT from a join's ON.
const STATE = `INSERT INTO connect_state (entity_id, checked_at, next_check, status)
  SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.next'), json_extract(value, '$.status') FROM json_each(?) WHERE true
  ON CONFLICT(entity_id) DO UPDATE SET checked_at=excluded.checked_at, next_check=excluded.next_check, status=excluded.status`;

const RELATIONS = `INSERT INTO relations (from_qid, rel, to_qid, ord, seen_at)
  SELECT json_extract(value, '$.from'), json_extract(value, '$.rel'), json_extract(value, '$.to'), json_extract(value, '$.ord'), ?
  FROM json_each(?) WHERE true
  ON CONFLICT(from_qid, rel, to_qid) DO UPDATE SET ord=COALESCE(excluded.ord, relations.ord), seen_at=excluded.seen_at`;

const WORKS = `INSERT INTO works (qid, data, fetched_at)
  SELECT json_extract(value, '$.qid'), value, ? FROM json_each(?) WHERE true
  ON CONFLICT(qid) DO UPDATE SET data=excluded.data, fetched_at=excluded.fetched_at`;

export interface ConnectResult {
  /** Linked things that just got a Wikidata id. */
  mapped: number;
  /** Linked things whose connections were read. */
  connected: number;
  relations: number;
  works: number;
  failed: number;
}

/**
 * Gathers connections for Sid's linked movies, shows, books and games (sure links only):
 * 1. Finds missing Wikidata ids from Open Library (books) and IMDb (movies, shows) ids. Only exact,
 *    unique matches are kept; nothing else about the linked thing changes.
 * 2. Reads series, sequels, adaptations and franchises, the other members of each series, and the
 *    names and years of everything connected.
 * Adds no cards: the card shows connections and Sid adds what he wants.
 */
export async function connectWorks(env: Env, now = Date.now()): Promise<ConnectResult> {
  const out: ConnectResult = { mapped: 0, connected: 0, relations: 0, works: 0, failed: 0 };
  const db = env.DB;

  // 1. Missing Wikidata ids.
  const { results: missing } = await db
    .prepare(
      `SELECT e.data FROM entities e LEFT JOIN connect_state cs ON cs.entity_id = e.id
      WHERE e.category IN ${CATEGORIES} AND e.confidence IN ${SURE}
        AND json_extract(e.data, '$.qid') IS NULL
        AND (json_extract(e.data, '$.openLibrary') IS NOT NULL OR e.imdb IS NOT NULL)
        AND (cs.entity_id IS NULL OR cs.next_check <= ?)
      LIMIT ?`,
    )
    .bind(now, MAP_PER_RUN)
    .all<{ data: string }>();
  if (missing.length) {
    const ents = missing.map((r) => JSON.parse(r.data) as Entity);
    try {
      const books = ents.filter((e) => e.openLibrary);
      const titles = ents.filter((e) => !e.openLibrary && e.imdb);
      const [byOl, byImdb] = await Promise.all([
        qidsByExternalId(
          workerFetch,
          "P648",
          books.map((e) => e.openLibrary!),
        ),
        qidsByExternalId(
          workerFetch,
          "P345",
          titles.map((e) => e.imdb!),
        ),
      ]);
      const found: Entity[] = [];
      const state: { id: string; next: number; status: string }[] = [];
      for (const e of ents) {
        const qid = e.openLibrary ? byOl.get(e.openLibrary) : e.imdb ? byImdb.get(e.imdb) : undefined;
        if (qid) found.push({ ...e, qid, updatedAt: now });
        // Found: due for connecting at once. Not found: look again later.
        state.push({ id: e.id, next: qid ? now : now + RETRY_MISSING_AFTER, status: qid ? "mapped" : "no-qid" });
      }
      await db.batch([
        ...found.map((e) => db.prepare(UPSERT_ENTITY).bind(...entityRow(e))),
        db.prepare(STATE).bind(now, JSON.stringify(state)),
      ]);
      out.mapped = found.length;
    } catch (err) {
      out.failed += ents.length;
      console.error(JSON.stringify({ job: "connect", step: "map", error: String(err) }));
    }
  }

  // 2. Connections for the linked things that are due.
  const { results: due } = await db
    .prepare(
      `SELECT e.id, json_extract(e.data, '$.qid') AS qid FROM entities e LEFT JOIN connect_state cs ON cs.entity_id = e.id
      WHERE e.category IN ${CATEGORIES} AND e.confidence IN ${SURE}
        AND json_extract(e.data, '$.qid') IS NOT NULL
        AND (cs.entity_id IS NULL OR cs.next_check <= ?)
      ORDER BY COALESCE(cs.next_check, 0)
      LIMIT ?`,
    )
    .bind(now, CONNECT_PER_RUN)
    .all<{ id: string; qid: string }>();
  if (!due.length) return out;
  const qids = [...new Set(due.map((d) => d.qid))];
  try {
    const rels = await relationsOf(workerFetch, qids);
    const members = await seriesMembers(workerFetch, seriesOf(rels));
    const all: Relation[] = [...rels, ...members];
    const wanted = [...new Set([...qids, ...all.flatMap((r) => [r.from, r.to])])];
    const { results: fresh } = await db
      .prepare(`SELECT qid FROM works WHERE qid IN (SELECT value FROM json_each(?)) AND fetched_at > ?`)
      .bind(JSON.stringify(wanted), now - WORK_STALE_AFTER)
      .all<{ qid: string }>();
    const have = new Set(fresh.map((r) => r.qid));
    const works = await worksByQid(
      workerFetch,
      wanted.filter((q) => !have.has(q)),
    );
    await db.batch([
      db.prepare(RELATIONS).bind(now, JSON.stringify(all)),
      db.prepare(WORKS).bind(now, JSON.stringify(works)),
      db
        .prepare(STATE)
        .bind(now, JSON.stringify(due.map((d) => ({ id: d.id, next: now + RECONNECT_AFTER, status: "connected" })))),
    ]);
    out.connected = due.length;
    out.relations = all.length;
    out.works = works.length;
  } catch (err) {
    out.failed += due.length;
    console.error(JSON.stringify({ job: "connect", step: "connect", error: String(err) }));
    // Keep going next time, a little later.
    await db
      .prepare(STATE)
      .bind(now, JSON.stringify(due.map((d) => ({ id: d.id, next: now + 6 * HOUR, status: "failed" }))))
      .run();
  }
  return out;
}

/** How far the connecting has got, for the progress script and Settings. */
export async function connectProgress(env: Env, now = Date.now()) {
  const row = await env.DB.prepare(
    `SELECT
      COUNT(*) AS total,
      SUM(json_extract(e.data, '$.qid') IS NOT NULL) AS withQid,
      SUM(cs.status = 'connected') AS connected,
      SUM(cs.status = 'no-qid') AS noQid,
      SUM(json_extract(e.data, '$.qid') IS NOT NULL AND (cs.entity_id IS NULL OR cs.next_check <= ?)) AS due
    FROM entities e LEFT JOIN connect_state cs ON cs.entity_id = e.id
    WHERE e.category IN ${CATEGORIES} AND e.confidence IN ${SURE}`,
  )
    .bind(now)
    .first<Record<string, number | null>>();
  const counts = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM relations) AS relations, (SELECT COUNT(*) FROM works) AS works`,
  ).first<Record<string, number>>();
  return {
    total: row?.total ?? 0,
    withQid: row?.withQid ?? 0,
    connected: row?.connected ?? 0,
    noQid: row?.noQid ?? 0,
    due: row?.due ?? 0,
    relations: counts?.relations ?? 0,
    works: counts?.works ?? 0,
  };
}
