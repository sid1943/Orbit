import {
  reviewedLinked,
  type Confidence,
  type ReviewDecision,
  type Status,
  type SyncItem,
  type SyncPage,
} from "@orbit/core";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import { intParam } from "../lib/validation.js";

export const sync = new Hono<AppEnv>();

/** Changes written while a sync runs could carry a time just before `at`; re-sending a few seconds is harmless. */
export const SYNC_OVERLAP_MS = 5_000;
const DEFAULT_PAGE = 2000;
const MAX_PAGE = 5000;

// The light fields are read from each card's JSON here, in the database, so the Worker
// never parses whole cards (the free plan allows 10 ms of CPU per request).
const SYNC_ITEMS = `SELECT i.id, i.kind, i.title, i.status, i.archived, i.deleted, i.entity_id AS entityId, i.due,
  json_extract(i.data, '$.start') AS start,
  json_extract(i.data, '$.tags') AS tags,
  json_extract(i.data, '$.props') AS props,
  (SELECT count(*) FROM json_each(i.data, '$.checklists') c, json_each(c.value, '$.rows') r) AS total,
  (SELECT count(*) FROM json_each(i.data, '$.checklists') c, json_each(c.value, '$.rows') r
    WHERE json_extract(r.value, '$.done') = 1) AS done,
  e.category, e.confidence, json_extract(e.data, '$.lat') AS lat, json_extract(e.data, '$.lng') AS lng,
  cv.url AS cover, rv.decision,
  i.created_at AS createdAt, i.updated_at AS updatedAt
FROM items i
LEFT JOIN entities e ON e.id = i.entity_id
LEFT JOIN covers cv ON cv.entity_id = i.entity_id
LEFT JOIN reviews rv ON rv.entity_id = i.entity_id
WHERE i.id > ?1 AND (i.updated_at > ?2 OR e.updated_at > ?2 OR cv.fetched_at > ?2 OR rv.at > ?2)
ORDER BY i.id LIMIT ?3`;

const SYNC_REMOVED = `SELECT id FROM removed WHERE removed_at > ? AND id NOT IN (SELECT id FROM items)`;

interface SyncRow {
  id: string;
  kind: string;
  title: string;
  status: string;
  archived: number;
  deleted: number;
  entityId: string | null;
  due: string | null;
  start: string | null;
  tags: string | null;
  props: string | null;
  total: number;
  done: number;
  category: string | null;
  confidence: string | null;
  lat: number | null;
  lng: number | null;
  cover: string | null;
  decision: string | null;
  createdAt: number;
  updatedAt: number;
}

const json = <T>(s: string | null, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

export function toSyncRow(r: SyncRow): SyncItem {
  const linked = r.entityId && r.category !== null;
  const reviewed = reviewedLinked(
    { confidence: (r.confidence as Confidence | null) ?? null, lat: r.lat ?? null, lng: r.lng ?? null },
    json<ReviewDecision | null>(r.decision, null),
  );
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    status: r.status as Status,
    tags: json<string[]>(r.tags, []),
    props: json<Record<string, string>>(r.props, {}),
    due: r.due,
    start: r.start ?? null,
    archived: !!r.archived,
    deleted: !!r.deleted,
    entityId: r.entityId,
    category: linked ? r.category : null,
    ...(linked ? reviewed : { confidence: null, lat: null, lng: null }),
    cover: linked ? (r.cover ?? null) : null,
    done: r.done,
    total: r.total,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/**
 * Every card in light form, deleted ones included, in pages ordered by id.
 * `?since=` (the `at` of the last sync) returns only what changed; `?after=` is the page cursor.
 */
sync.get("/", async (c) => {
  const at = Date.now();
  const since = intParam(c.req.query("since"), 0);
  const from = since > 0 ? since - SYNC_OVERLAP_MS : 0;
  const after = c.req.query("after") ?? "";
  const limit = Math.min(intParam(c.req.query("limit"), DEFAULT_PAGE) || DEFAULT_PAGE, MAX_PAGE);
  const db = c.env.DB;
  const { results } = await db.prepare(SYNC_ITEMS).bind(after, from, limit).all<SyncRow>();
  const removed =
    since > 0 && !after
      ? (await db.prepare(SYNC_REMOVED).bind(from).all<{ id: string }>()).results.map((r) => r.id)
      : [];
  const page: SyncPage = {
    items: results.map(toSyncRow),
    removed,
    at,
    next: results.length === limit ? results[results.length - 1]!.id : null,
  };
  return c.json(page);
});
