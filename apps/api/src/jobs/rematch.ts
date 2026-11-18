import {
  enrichItem,
  movieGuesses,
  openLibraryAuthors,
  rematchBook,
  wikidataBooksByTitle,
  type Entity,
} from "@orbit/core";
import { UPSERT_COVER, UPSERT_ENTITY, entityRow } from "../db/statements.js";
import type { Env } from "../env.js";
import { HOUR, workerFetch } from "./shared.js";

/**
 * The second look for books and movies the first matching pass missed (the Data chat's backlog).
 * Run on request (`POST /api/connections/run?rematch=1`, `npm run connect`), not by the cron:
 * each unmatched row may take a few searches. Every answer must be sure; anything less stays as it is.
 *
 * 1. Unmatched books (`none`): each row read as title / author pairs, checked on Open Library.
 * 2. Unmatched movies (`none`): tidied titles, checked on Wikidata with the enricher's sure rule.
 * 3. Linked books with no Wikidata id: searched on Wikidata by title and author.
 *
 * Rows Sid answered in review are left alone. A matched row keeps its name and becomes a sure link;
 * the connections job then gives it a Wikidata id, a Goodreads page and its connections.
 */

const DAY = 24 * HOUR;
/** Unmatched books per run: up to 3 Open Library searches each. */
const BOOKS_PER_RUN = 10;
/** Unmatched movies per run: up to 2 readings, 3 Wikidata requests each. */
const MOVIES_PER_RUN = 2;
/** Linked books per Wikidata title search (one query), plus one Open Library request for missing authors. */
const TITLES_PER_RUN = 40;
/** Not found: look again in three months (only a new source or a fixed title would change the answer). */
const RETRY_AFTER = 90 * DAY;

const LOOKUP = `INSERT INTO lookup_state (entity_id, kind, checked_at, next_check, status)
  SELECT json_extract(value, '$.id'), ?, ?, json_extract(value, '$.next'), json_extract(value, '$.status') FROM json_each(?) WHERE true
  ON CONFLICT(entity_id, kind) DO UPDATE SET checked_at=excluded.checked_at, next_check=excluded.next_check, status=excluded.status`;

export interface RematchResult {
  /** Rows looked at (0 when nothing is left). */
  looked: number;
  /** Unmatched books and movies that now have a sure link. */
  linked: number;
  /** Linked books that got a Wikidata id from the title search. */
  qids: number;
  failed: number;
}

const due = (kind: string, where: string) =>
  `SELECT e.data FROM entities e
  LEFT JOIN lookup_state ls ON ls.entity_id = e.id AND ls.kind = '${kind}'
  LEFT JOIN reviews rv ON rv.entity_id = e.id
  WHERE ${where} AND rv.entity_id IS NULL AND (ls.entity_id IS NULL OR ls.next_check <= ?)
  ORDER BY e.id LIMIT ?`;

export async function rematchUnlinked(env: Env, now = Date.now()): Promise<RematchResult> {
  const out: RematchResult = { looked: 0, linked: 0, qids: 0, failed: 0 };
  const db = env.DB;
  const load = async (kind: string, where: string, limit: number) =>
    (await db.prepare(due(kind, where)).bind(now, limit).all<{ data: string }>()).results.map(
      (r) => JSON.parse(r.data) as Entity,
    );

  const books = await load("rematch", `e.category = 'book' AND e.confidence = 'none'`, BOOKS_PER_RUN);
  const movies = await load("rematch", `e.category = 'movie' AND e.confidence = 'none'`, MOVIES_PER_RUN);
  const titled = await load(
    "wd-title",
    `e.category = 'book' AND e.confidence IN ('high','user') AND json_extract(e.data, '$.qid') IS NULL
      AND EXISTS (SELECT 1 FROM connect_state cs WHERE cs.entity_id = e.id AND cs.status = 'no-qid')`,
    TITLES_PER_RUN,
  );
  out.looked = books.length + movies.length + titled.length;
  if (!out.looked) return out;

  const stmts: D1PreparedStatement[] = [];
  const state: { id: string; next: number; status: string }[] = [];
  const titleState: { id: string; next: number; status: string }[] = [];
  const link = (e: Entity, found: Partial<Entity>, coverUrl?: string) => {
    const linked: Entity = { ...e, ...found, name: e.name, category: e.category, confidence: "high", updatedAt: now };
    stmts.push(db.prepare(UPSERT_ENTITY).bind(...entityRow(linked)));
    if (coverUrl) stmts.push(db.prepare(UPSERT_COVER).bind(e.id, coverUrl, new URL(coverUrl).hostname, now));
    out.linked++;
  };

  for (const e of books) {
    try {
      const hit = await rematchBook(workerFetch, e.name);
      if (hit) link(e, hit.entity, hit.coverUrl);
      state.push({ id: e.id, next: hit ? now + 365 * DAY : now + RETRY_AFTER, status: hit ? "linked" : "missing" });
    } catch (err) {
      out.failed++;
      console.error(JSON.stringify({ job: "rematch", step: "book", error: String(err) }));
    }
  }

  for (const e of movies) {
    try {
      let hit: Partial<Entity> | null = null;
      let cover: string | undefined;
      for (const g of movieGuesses(e.name).slice(0, 2)) {
        const r = await enrichItem(workerFetch, {
          kind: "Movie",
          title: g.title,
          props: g.year ? { Year: String(g.year) } : {},
        });
        if (r.confidence === "high" && r.entity) {
          const { name: _n, category: _c, confidence: _f, ...ids } = r.entity;
          hit = ids;
          cover = r.coverUrl;
          break;
        }
      }
      if (hit) link(e, hit, cover);
      state.push({ id: e.id, next: hit ? now + 365 * DAY : now + RETRY_AFTER, status: hit ? "linked" : "missing" });
    } catch (err) {
      out.failed++;
      console.error(JSON.stringify({ job: "rematch", step: "movie", error: String(err) }));
    }
  }

  if (titled.length) {
    try {
      const needAuthor = titled.filter((b) => !b.author && b.openLibrary).map((b) => b.openLibrary!);
      const authors = await openLibraryAuthors(workerFetch, needAuthor);
      const asked = titled.map((b) => ({
        id: b.id,
        title: b.label ?? b.name,
        author: b.author ?? (b.openLibrary ? authors.get(b.openLibrary) : undefined) ?? "",
      }));
      const found = await wikidataBooksByTitle(workerFetch, asked);
      for (const b of titled) {
        const qid = found.get(b.id);
        if (qid) {
          stmts.push(db.prepare(UPSERT_ENTITY).bind(...entityRow({ ...b, qid, updatedAt: now })));
          out.qids++;
        }
        titleState.push({
          id: b.id,
          next: qid ? now + 365 * DAY : now + RETRY_AFTER,
          status: qid ? "found" : "missing",
        });
      }
      const got = JSON.stringify(titleState.filter((s) => s.status === "found").map((s) => s.id));
      // Connect them now, and look for their Goodreads page again (Wikidata may have it).
      stmts.push(
        db
          .prepare(
            `UPDATE connect_state SET next_check = ?, status = 'mapped' WHERE entity_id IN (SELECT value FROM json_each(?))`,
          )
          .bind(now, got),
        db
          .prepare(
            `DELETE FROM lookup_state WHERE kind = 'goodreads' AND entity_id IN (SELECT value FROM json_each(?))`,
          )
          .bind(got),
      );
    } catch (err) {
      out.failed += titled.length;
      console.error(JSON.stringify({ job: "rematch", step: "wikidata-title", error: String(err) }));
    }
  }

  // Rows that just got a sure link are new to the connections job: no state row means due at once.
  stmts.push(db.prepare(LOOKUP).bind("rematch", now, JSON.stringify(state)));
  if (titleState.length) stmts.push(db.prepare(LOOKUP).bind("wd-title", now, JSON.stringify(titleState)));
  await db.batch(stmts);
  return out;
}

/** How far the second look has got. */
export async function rematchProgress(env: Env) {
  const row = await env.DB.prepare(
    `SELECT
      (SELECT COUNT(*) FROM entities e LEFT JOIN reviews rv ON rv.entity_id = e.id
        WHERE e.category IN ('book','movie') AND e.confidence = 'none' AND rv.entity_id IS NULL) AS unmatched,
      (SELECT COUNT(*) FROM lookup_state WHERE kind = 'rematch') AS rematchLooked,
      (SELECT COUNT(*) FROM lookup_state WHERE kind = 'rematch' AND status = 'linked') AS rematchLinked,
      (SELECT COUNT(*) FROM lookup_state WHERE kind = 'wd-title') AS titleLooked,
      (SELECT COUNT(*) FROM lookup_state WHERE kind = 'wd-title' AND status = 'found') AS titleFound`,
  ).first<Record<string, number>>();
  return {
    unmatched: row?.unmatched ?? 0,
    rematchLooked: row?.rematchLooked ?? 0,
    rematchLinked: row?.rematchLinked ?? 0,
    titleLooked: row?.titleLooked ?? 0,
    titleFound: row?.titleFound ?? 0,
  };
}
