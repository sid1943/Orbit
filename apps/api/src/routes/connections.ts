import { Hono } from "hono";
import {
  connectionsFor,
  relationsNeeded,
  type Connections,
  type Entity,
  type OrbitRef,
  type Relation,
  type Work,
} from "@orbit/core";
import { IN_JSON } from "../db/statements.js";
import type { AppEnv } from "../env.js";
import { connectProgress, connectWorks } from "../jobs/connect-works.js";

export const connections = new Hono<AppEnv>();

/** How far gathering connections has got. */
connections.get("/progress", async (c) => c.json(await connectProgress(c.env)));

/** Gather one batch now (the cron does this every 10 minutes too). */
connections.post("/run", async (c) => c.json(await connectWorks(c.env)));

/**
 * A card's connections: its series (every member in order, where this one sits, what's next),
 * what it follows and what follows it, what it's based on and what was made from it, its franchise.
 * Each connected thing says which of Sid's cards it is, if any. `connections` is null when the
 * card's linked thing has no Wikidata id (yet).
 */
connections.get("/:itemId", async (c) => {
  const db = c.env.DB;
  const row = await db
    .prepare(
      `SELECT e.data FROM items i JOIN entities e ON e.id = i.entity_id WHERE i.id = ? AND e.confidence IN ('high','user')`,
    )
    .bind(c.req.param("itemId"))
    .first<{ data: string }>();
  const qid = row ? (JSON.parse(row.data) as Entity).qid : undefined;
  if (!qid) return c.json({ connections: null as Connections | null });

  // Everything touching this thing, plus the other members of its series.
  const { results: rels } = await db
    .prepare(
      `WITH s AS (SELECT to_qid FROM relations WHERE from_qid = ?1 AND rel = 'series')
      SELECT from_qid, rel, to_qid, ord FROM relations
      WHERE from_qid = ?1 OR to_qid = ?1 OR (rel = 'series' AND to_qid IN (SELECT to_qid FROM s))`,
    )
    .bind(qid)
    .all<{ from_qid: string; rel: Relation["rel"]; to_qid: string; ord: number | null }>();
  const relations = relationsNeeded(
    qid,
    rels.map((r) => ({ from: r.from_qid, rel: r.rel, to: r.to_qid, ...(r.ord != null ? { ord: r.ord } : {}) })),
  );
  const qids = JSON.stringify([...new Set([qid, ...relations.flatMap((r) => [r.from, r.to])])]);
  const [works, cards] = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT data FROM works WHERE qid IN (${IN_JSON})`).bind(qids),
    db
      .prepare(
        `SELECT json_extract(e.data, '$.qid') AS qid, i.id, i.title, i.status FROM entities e JOIN items i ON i.entity_id = e.id
        WHERE json_extract(e.data, '$.qid') IN (${IN_JSON}) AND i.deleted = 0`,
      )
      .bind(qids),
  ]);
  const workMap = new Map(
    (works?.results ?? []).map((r) => {
      const w = JSON.parse(String(r.data)) as Work;
      return [w.qid, w];
    }),
  );
  const inOrbit = new Map<string, OrbitRef[]>();
  for (const r of cards?.results ?? []) {
    const q = String(r.qid);
    inOrbit.set(q, [
      ...(inOrbit.get(q) ?? []),
      { itemId: String(r.id), title: String(r.title), status: String(r.status) },
    ]);
  }
  return c.json({ connections: connectionsFor(qid, relations, workMap, inOrbit) });
});
