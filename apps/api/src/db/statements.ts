import { applyReview, type Entity, type Item, type Review, type ReviewDecision } from "@orbit/core";

/** SQL shared by the routes, the jobs and the import script. Rows keep the whole record as JSON in `data`. */

export const itemRow = (it: Item) => [
  it.id,
  it.kind,
  it.title,
  it.status,
  it.archived ? 1 : 0,
  it.deleted ? 1 : 0,
  it.entityId,
  it.due,
  JSON.stringify(it),
  it.createdAt,
  it.updatedAt,
];
export const UPSERT_ITEM = `INSERT INTO items (id, kind, title, status, archived, deleted, entity_id, due, data, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, title=excluded.title, status=excluded.status, archived=excluded.archived,
  deleted=excluded.deleted, entity_id=excluded.entity_id, due=excluded.due, data=excluded.data, updated_at=excluded.updated_at`;

export const entityRow = (e: Entity) => [
  e.id,
  e.name,
  e.category,
  e.confidence,
  e.imdb ?? null,
  JSON.stringify(e),
  e.updatedAt,
];
export const UPSERT_ENTITY = `INSERT INTO entities (id, name, category, confidence, imdb, data, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category, confidence=excluded.confidence,
  imdb=excluded.imdb, data=excluded.data, updated_at=excluded.updated_at`;

export const reviewRow = (r: Review) => [r.entityId, JSON.stringify(r.decision), r.at];
export const UPSERT_REVIEW = `INSERT INTO reviews (entity_id, decision, at) VALUES (?, ?, ?)
  ON CONFLICT(entity_id) DO UPDATE SET decision=excluded.decision, at=excluded.at`;

export const UPSERT_LIVE = `INSERT INTO live (entity_id, source, data, checked_at, next_check) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(entity_id) DO UPDATE SET source=excluded.source, data=excluded.data, checked_at=excluded.checked_at, next_check=excluded.next_check`;

export const UPSERT_COVER = `INSERT INTO covers (entity_id, url, source, fetched_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(entity_id) DO UPDATE SET url=excluded.url, source=excluded.source, fetched_at=excluded.fetched_at`;

export const parse = <T>(row: { data: string } | null): T | null => (row ? (JSON.parse(row.data) as T) : null);

/** `id IN (${IN_JSON})` with the ids bound as one JSON list: one parameter however many ids. */
export const IN_JSON = "SELECT value FROM json_each(?)";

/** Ids of a card's linked thing, every checklist row's, and those of the cards its rows point at (bind the card id as ?1). */
export const CARD_ENTITY_IDS = `WITH ids(id) AS (
  SELECT entity_id FROM items WHERE id = ?1 AND entity_id IS NOT NULL
  UNION
  SELECT json_extract(r.value, '$.entityId') FROM items i, json_each(i.data, '$.checklists') c, json_each(c.value, '$.rows') r
  WHERE i.id = ?1 AND json_extract(r.value, '$.entityId') IS NOT NULL
  UNION
  SELECT ri.entity_id FROM items i, json_each(i.data, '$.checklists') c, json_each(c.value, '$.rows') r
  JOIN items ri ON ri.id = json_extract(r.value, '$.ref')
  WHERE i.id = ?1 AND ri.entity_id IS NOT NULL
)`;

/** A linked thing's row with its review answer, for `withReview`. */
export interface EntityReviewRow {
  data: string;
  decision: string | null;
}

/** Applies Sid's answer to a linked thing as it comes out of the database (see `applyReview`). */
export const withReview = (r: EntityReviewRow): Entity =>
  applyReview(JSON.parse(r.data) as Entity, r.decision ? (JSON.parse(r.decision) as ReviewDecision) : null);
