import type { Confidence, Entity, Item, LiveStatus, Review, ReviewDecision, Status } from "./types.js";

/**
 * The compact card list every page works from (`GET /api/sync`).
 * It has what lists, Today's sections, topics, search and the map need, but not notes,
 * links or checklist rows: open a card (`GET /api/items/:id/full`) for those.
 */
export interface SyncItem {
  id: string;
  kind: string;
  title: string;
  status: Status;
  /** Topics */
  tags: string[];
  /** Details such as Quest, Genre, Watch on, Year */
  props: Record<string, string>;
  due: string | null;
  start: string | null;
  archived: boolean;
  deleted: boolean;
  entityId: string | null;
  /** From the card's linked thing, with Sid's review answer applied. */
  category: string | null;
  confidence: Confidence | null;
  lat: number | null;
  lng: number | null;
  cover: string | null;
  /** Checklist rows ticked, and all checklist rows. */
  done: number;
  total: number;
  createdAt: number;
  updatedAt: number;
}

/** One card with everything its panel shows (`GET /api/items/:id/full`). */
export interface FullItem {
  item: Item;
  /** The card's linked thing and every checklist row's, with Sid's review answers applied. */
  entities: Entity[];
  live: LiveStatus[];
  /** Cover image address by entity id. */
  covers: Record<string, string>;
  /** Answers about these things, hidden links (`x:` keys) and the card's own (`card-<id>`). */
  reviews: Review[];
}

/** The fields of a SyncItem that come from the card's linked thing rather than the card. */
export type SyncLinked = Pick<SyncItem, "category" | "confidence" | "lat" | "lng" | "cover">;

export const NO_LINK: SyncLinked = { category: null, confidence: null, lat: null, lng: null, cover: null };

/** One page of `GET /api/sync`. Pass `at` back as `since` next time to get only what changed. */
export interface SyncPage {
  items: SyncItem[];
  /** Ids of cards removed for good since `since`. */
  removed: string[];
  at: number;
  /** Cursor for the next page (`after`), or null on the last page. */
  next: string | null;
}

/** What the web app keeps: every card, newest change first. */
export interface SyncState {
  items: SyncItem[];
  at: number;
}

/** Ticked and total checklist rows on a card. */
export function checklistProgress(item: Pick<Item, "checklists">): { done: number; total: number } {
  let done = 0,
    total = 0;
  for (const c of item.checklists) {
    for (const r of c.rows) {
      total++;
      if (r.done) done++;
    }
  }
  return { done, total };
}

/** The confidence and coordinates of a linked thing once Sid's answer is applied (see `applyReview`). */
export function reviewedLinked(
  base: Pick<SyncLinked, "confidence" | "lat" | "lng">,
  decision: ReviewDecision | null | undefined,
): Pick<SyncLinked, "confidence" | "lat" | "lng"> {
  const drop = { lat: null, lng: null };
  switch (decision?.d) {
    case "yes":
      return base.confidence === "review" ? { ...base, confidence: "high" } : base;
    case "alt":
      return { ...base, confidence: "high" };
    case "no":
      return { confidence: "rejected", ...drop };
    case "none":
      return { confidence: "nolink", ...drop };
    case "fix":
      return decision.add ? base : { confidence: "user", ...drop };
    default:
      return base;
  }
}

const pickLinked = ({ category, confidence, lat, lng, cover }: SyncLinked): SyncLinked => ({
  category,
  confidence,
  lat,
  lng,
  cover,
});

/** A full card as a sync row, keeping what is known about its linked thing. Used to update the list after an edit. */
export function toSyncItem(item: Item, linked: SyncLinked = NO_LINK): SyncItem {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    status: item.status,
    tags: item.tags,
    props: item.props,
    due: item.due,
    start: item.start,
    archived: item.archived,
    deleted: item.deleted,
    entityId: item.entityId,
    ...pickLinked(item.entityId ? linked : NO_LINK),
    ...checklistProgress(item),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/** Adds changed cards to the list and drops removed ones. Newest change first. */
export function mergeSync(
  prev: SyncState | undefined,
  change: { items: SyncItem[]; removed: string[]; at: number },
): SyncState {
  const byId = new Map((prev?.items ?? []).map((i) => [i.id, i]));
  for (const i of change.items) byId.set(i.id, i);
  for (const id of change.removed) byId.delete(id);
  const items = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : 1));
  return { items, at: Math.max(prev?.at ?? 0, change.at) };
}

/** Puts one edited card into the list (or takes it out), without waiting for the next sync. */
export function upsertSyncItem(state: SyncState, item: Item | null, id = item?.id): SyncState {
  if (!id) return state;
  const prev = state.items.find((i) => i.id === id);
  if (!item) return mergeSync(state, { items: [], removed: [id], at: state.at });
  const linked: SyncLinked = prev && prev.entityId === item.entityId ? prev : NO_LINK;
  return mergeSync(state, { items: [toSyncItem(item, linked)], removed: [], at: state.at });
}
