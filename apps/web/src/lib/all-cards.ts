import { KINDS, daysUntil, inSeasonOnly, timeInfo, type PlaceRow, type SyncItem, type TopicCount } from "@orbit/core";
import { listItems, parseGroup, parseStatus, type GroupBy, type StatusFilter } from "./list.js";
import { RADII, type Radius } from "./near-me.js";
import { placesOnCards } from "./near-you.js";

/**
 * The All cards view on Today (and kind pages): every card, narrowed by Orbit today's list filters
 * (status, kind, topic, show archived, grouping) plus its Near me distance, and a "when" filter for dated
 * cards. Everything lives in the address, so Back and shared links keep it.
 */

export type When = "any" | "soon" | "season" | "dated";
export type SortBy = "recent" | "title" | "near";

export const WHEN_OPTIONS: readonly { value: When; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "soon", label: "Coming up" },
  { value: "season", label: "In season" },
  { value: "dated", label: "Has a date" },
];

export const SORT_OPTIONS: readonly { value: SortBy; label: string }[] = [
  { value: "recent", label: "Recent" },
  { value: "title", label: "A–Z" },
  { value: "near", label: "Nearest" },
];

/** Distance choices for cards: Any, then 5 / 25 / 100 / 500 miles (Near me's). */
export const WITHIN_OPTIONS: readonly { value: Radius; label: string }[] = [
  { value: "any", label: "Any distance" },
  ...RADII.filter((r) => r !== "any").map((r) => ({ value: r, label: `${r} mi` })),
];

/** "Coming up" means the next date is this many days away or less (Today's Coming up uses the same). */
const SOON_DAYS = 120;

export interface CardFilters {
  status: StatusFilter;
  /** One kind, or every kind. */
  kind: string | null;
  /** A topic's lowercase key, or none. */
  topic: string | null;
  within: Radius;
  when: When;
  /** Show archived cards (otherwise the Lists setting decides). */
  archived: boolean;
  group: GroupBy;
  sort: SortBy;
}

export const NO_FILTERS: CardFilters = {
  status: "all",
  kind: null,
  topic: null,
  within: "any",
  when: "any",
  archived: false,
  group: "none",
  sort: "recent",
};

const pick = <T extends string>(raw: string | null, values: readonly T[], fallback: T): T =>
  (values as readonly string[]).includes(raw ?? "") ? (raw as T) : fallback;

/** Reads the filters from the address. Unknown values fall back to "no filter". */
export function readFilters(p: URLSearchParams): CardFilters {
  const w = p.get("within");
  const n = Number(w);
  return {
    status: parseStatus(p.get("status")),
    kind: p.get("kind")?.trim() || null,
    topic: p.get("topic")?.trim().toLowerCase() || null,
    within: (RADII as readonly (number | string)[]).includes(n) ? (n as Radius) : "any",
    when: pick(p.get("when"), ["any", "soon", "season", "dated"], "any"),
    archived: p.get("archived") === "1",
    group: parseGroup(p.get("group")),
    sort: pick(p.get("sort"), ["recent", "title", "near"], "recent"),
  };
}

/** Writes the filters into the address, leaving out the ones at their default. Other parameters are kept. */
export function writeFilters(p: URLSearchParams, f: CardFilters): URLSearchParams {
  const out = new URLSearchParams(p);
  const set = (key: string, value: string | null, empty: string | null) => {
    if (value === null || value === empty) out.delete(key);
    else out.set(key, value);
  };
  set("status", f.status, "all");
  set("kind", f.kind, null);
  set("topic", f.topic, null);
  set("within", String(f.within), "any");
  set("when", f.when, "any");
  set("archived", f.archived ? "1" : null, null);
  set("group", f.group, "none");
  set("sort", f.sort, "recent");
  return out;
}

/** How many filters are switched on (grouping and sort order don't count). */
export const activeFilterCount = (f: CardFilters): number =>
  [f.status !== "all", !!f.kind, !!f.topic, f.within !== "any", f.when !== "any", f.archived].filter(Boolean).length;

/** Miles from `here` to the closest place on each card (its own place or any row on its lists). */
export function closestMiles(
  places: readonly PlaceRow[],
  cards: readonly SyncItem[],
  here: { lat: number; lng: number },
): Map<string, number> {
  const out = new Map<string, number>();
  // placesOnCards gives closest first, so the first place seen for a card is its closest.
  for (const p of placesOnCards(places, cards, here, true)) if (!out.has(p.card.id)) out.set(p.card.id, p.miles);
  return out;
}

function whenMatches(card: SyncItem, when: When, now: Date): boolean {
  if (when === "any") return true;
  const ti = timeInfo(card, now);
  if (!ti) return false;
  if (when === "dated") return true;
  if (when === "season") return inSeasonOnly(ti, now);
  return ti.next !== null && daysUntil(ti.next, now) <= SOON_DAYS;
}

export interface AllCards {
  items: SyncItem[];
  /** Miles to each card's closest place, when a location is set. */
  miles: Map<string, number>;
}

/**
 * The cards the filters let through, in their order. `miles` is empty without a location: then the distance
 * filter and "Nearest" are ignored (the panel says why).
 */
export function allCards(
  cards: readonly SyncItem[],
  f: CardFilters,
  opts: {
    showArchived: boolean;
    places?: readonly PlaceRow[];
    here?: { lat: number; lng: number } | null;
    now?: Date;
  },
): AllCards {
  const now = opts.now ?? new Date();
  const miles = opts.here && opts.places ? closestMiles(opts.places, cards, opts.here) : new Map<string, number>();
  const useDistance = !!opts.here && !!opts.places;
  let items = listItems(cards, {
    ...(f.kind ? { kind: f.kind } : {}),
    status: f.status,
    showArchived: opts.showArchived || f.archived,
  }).filter(
    (c) =>
      (!f.topic || c.tags.some((t) => t.toLowerCase() === f.topic)) &&
      whenMatches(c, f.when, now) &&
      (!useDistance || f.within === "any" || (miles.get(c.id) ?? Infinity) <= f.within),
  );
  if (f.sort === "title") items = [...items].sort((a, b) => a.title.localeCompare(b.title));
  else if (f.sort === "near" && useDistance)
    items = [...items].sort((a, b) => (miles.get(a.id) ?? Infinity) - (miles.get(b.id) ?? Infinity));
  return { items, miles };
}

/** Kinds to choose from: the standard order, then any others the cards use. */
export function kindChoices(cards: readonly SyncItem[], listed: readonly string[] = KINDS): string[] {
  const used = new Set(cards.filter((c) => !c.deleted).map((c) => c.kind));
  return [...listed.filter((k) => used.has(k)), ...[...used].filter((k) => !listed.includes(k)).sort()];
}

/** Topics to choose from, biggest first (only topics on two or more cards, to keep the list short). */
export const topicChoices = (topics: readonly TopicCount[]): TopicCount[] => topics.filter((t) => t.count >= 2);
