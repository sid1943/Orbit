import {
  CITY_CATEGORIES,
  NO_DISTANCE,
  placeSpot,
  reviewedPlace,
  type Confidence,
  type PlaceRow,
  type PlacesPage,
  type ReviewDecision,
} from "@orbit/core";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import { intParam } from "../lib/validation.js";
import { SYNC_OVERLAP_MS } from "./sync.js";

export const places = new Hono<AppEnv>();

const list = (s: ReadonlySet<string>) => [...s].map((c) => `'${c}'`).join(",");

/**
 * Every card and checklist row linked to a place, read straight from the cards' JSON in the database.
 * `?1` limits it to cards changed since a time (0 for all of them).
 */
const PLACES_SQL = `WITH linked AS (
  SELECT i.id AS itemId, NULL AS checklist, NULL AS row, i.title AS text, i.status = 'done' AS done,
    i.entity_id AS entityId, i.updated_at AS changed
  FROM items i WHERE i.entity_id IS NOT NULL AND i.deleted = 0
  UNION ALL
  SELECT i.id, CAST(c.key AS INTEGER), CAST(r.key AS INTEGER), json_extract(r.value, '$.text'),
    json_extract(r.value, '$.done') = 1, json_extract(r.value, '$.entityId'), i.updated_at
  FROM items i, json_each(i.data, '$.checklists') c, json_each(c.value, '$.rows') r
  WHERE i.deleted = 0 AND json_extract(r.value, '$.entityId') IS NOT NULL
),
found AS (
  SELECT l.*, e.category, e.confidence, e.updated_at AS entityChanged,
    json_extract(e.data, '$.lat') AS lat, json_extract(e.data, '$.lng') AS lng,
    json_extract(e.data, '$.location') AS location, rv.decision, rv.at AS reviewed
  FROM linked l JOIN entities e ON e.id = l.entityId LEFT JOIN reviews rv ON rv.entity_id = e.id
  WHERE e.category NOT IN (${list(NO_DISTANCE)})
    AND (json_extract(e.data, '$.lat') IS NOT NULL
      OR (e.category IN (${list(CITY_CATEGORIES)}) AND json_extract(e.data, '$.location') IS NOT NULL))
),
changed AS (
  SELECT id FROM items WHERE ?1 = 0 OR updated_at > ?1
  UNION SELECT itemId FROM found WHERE entityChanged > ?1 OR reviewed > ?1
  UNION SELECT id FROM removed WHERE removed_at > ?1
)
SELECT f.itemId, f.checklist, f.row, f.text, f.done, f.entityId, f.category, f.confidence, f.lat, f.lng,
  f.location, f.decision
FROM found f WHERE f.itemId IN (SELECT id FROM changed)
ORDER BY f.itemId, f.checklist, f.row`;

const CHANGED_SQL = `WITH linked AS (
  SELECT i.id AS itemId, i.entity_id AS entityId FROM items i WHERE i.entity_id IS NOT NULL
  UNION ALL
  SELECT i.id, json_extract(r.value, '$.entityId')
  FROM items i, json_each(i.data, '$.checklists') c, json_each(c.value, '$.rows') r
  WHERE json_extract(r.value, '$.entityId') IS NOT NULL
)
SELECT id FROM items WHERE updated_at > ?1
UNION SELECT l.itemId FROM linked l JOIN entities e ON e.id = l.entityId LEFT JOIN reviews rv ON rv.entity_id = e.id
  WHERE e.updated_at > ?1 OR rv.at > ?1
UNION SELECT id FROM removed WHERE removed_at > ?1`;

interface Row {
  itemId: string;
  checklist: number | null;
  row: number | null;
  text: string | null;
  done: number;
  entityId: string;
  category: string;
  confidence: string | null;
  lat: number | null;
  lng: number | null;
  location: string | null;
  decision: string | null;
}

export function toPlace(r: Row): PlaceRow | null {
  const place = reviewedPlace(
    {
      itemId: r.itemId,
      checklist: r.checklist,
      row: r.row,
      text: r.text ?? "",
      done: !!r.done,
      entityId: r.entityId,
      category: r.category,
      confidence: (r.confidence as Confidence | null) ?? null,
      lat: r.lat ?? null,
      lng: r.lng ?? null,
      location: r.location ?? null,
    },
    r.decision ? (JSON.parse(r.decision) as ReviewDecision) : null,
  );
  // A rejected guess loses its spot; keep the row only if its city still places it.
  return placeSpot(place) ? place : null;
}

/**
 * Every card and checklist row linked to a place, for Near you and Near me. With `?since=` (the `at` of
 * the last answer) only the places of cards that changed are sent, and `items` lists those cards so the
 * app replaces their places (a card that lost all its places is listed with none).
 */
places.get("/", async (c) => {
  const at = Date.now();
  const since = intParam(c.req.query("since"), 0);
  const from = since > 0 ? since - SYNC_OVERLAP_MS : 0;
  const db = c.env.DB;
  const { results } = await db.prepare(PLACES_SQL).bind(from).all<Row>();
  let items: string[] | null = null;
  if (from > 0) {
    // Cards that changed but have no places left aren't in the rows above, so ask for the list itself.
    const changed = await db.prepare(CHANGED_SQL).bind(from).all<{ id: string }>();
    items = changed.results.map((r) => r.id);
  }
  const page: PlacesPage = {
    places: results.map(toPlace).filter((p): p is PlaceRow => p !== null),
    items,
    at,
  };
  return c.json(page);
});
