import type { Fetch } from "./enrich.js";

/**
 * Connections between things, from Wikidata (free, no key): which series a book, movie or game
 * belongs to and where in it, what it follows and what follows it, what it is based on (a movie
 * made from a book) and what was made from it, and its franchise.
 *
 * Connected things don't have to be in Orbit: the card shows "Part of Dune · 3 of 6 · next:
 * Children of Dune" and Sid taps to add the ones he wants (Sid, 2026-11-17). Nothing here adds cards.
 */

/** What a connected thing is. */
export type WorkType = "movie" | "show" | "book" | "game" | "series" | "franchise" | "other";

/** A real-world thing known by its Wikidata id (QID), in Orbit or not. */
export interface Work {
  qid: string;
  label: string;
  type: WorkType;
  year?: number;
  imdb?: string;
  igdb?: string;
  openLibrary?: string;
  author?: string;
}

/**
 * One connection, always stored in one direction:
 * - `series`: `from` is part of the series `to`, at position `ord` when Wikidata gives one.
 * - `follows`: `from` comes after `to` (a sequel follows its original).
 * - `based_on`: `from` was made from `to` (the movie is based on the book).
 * - `franchise`: `from` belongs to the franchise `to`.
 */
export type RelationKind = "series" | "follows" | "based_on" | "franchise";

export interface Relation {
  from: string;
  rel: RelationKind;
  to: string;
  ord?: number;
}

// ---------- Wikidata Query Service ----------

const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "Orbit/0.1 (personal tracker; https://github.com/sid1943/orbit)";

/** Most connections one thing may have of one kind (Hamlet has hundreds of films; a card needs a few). */
export const MAX_PER_KIND = 40;
/** Most members read for one series. */
export const MAX_SERIES_MEMBERS = 100;

interface SparqlJson {
  results?: { bindings?: Record<string, { value: string } | undefined>[] };
}
type Row = Record<string, string | undefined>;

/** Runs one query (sent as a form POST, so long id lists fit) and returns plain rows. */
export async function sparql(fetch: Fetch, query: string): Promise<Row[]> {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Accept: "application/sparql-results+json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `query=${encodeURIComponent(query)}`,
  });
  if (!r.ok) throw new Error(`Wikidata query failed: HTTP ${r.status}`);
  const json = (await r.json()) as SparqlJson;
  return (json.results?.bindings ?? []).map((b) =>
    Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v?.value])),
  );
}

const isQid = (s: string): boolean => /^Q\d+$/.test(s);
/** "http://www.wikidata.org/entity/Q42" -> "Q42" */
export const qidOf = (uri: string | undefined): string | undefined => {
  const q = uri?.split("/").pop();
  return q && isQid(q) ? q : undefined;
};
const values = (qids: string[]): string =>
  qids
    .filter(isQid)
    .map((q) => `wd:${q}`)
    .join(" ");
/** A plain string literal for a query, with anything odd removed. */
const lit = (s: string): string => `"${s.replace(/[^A-Za-z0-9._-]/g, "")}"`;

/**
 * Finds Wikidata ids from another site's id: Open Library work ids (`P648`) for books,
 * IMDb ids (`P345`) for movies and shows. An id that two Wikidata items share is left out:
 * only sure answers count.
 */
export async function qidsByExternalId(
  fetch: Fetch,
  prop: "P648" | "P345",
  ids: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return out;
  const rows = await sparql(
    fetch,
    `SELECT ?item ?id WHERE { VALUES ?id { ${list.map(lit).join(" ")} } ?item wdt:${prop} ?id . }`,
  );
  const seen = new Map<string, Set<string>>();
  for (const r of rows) {
    const q = qidOf(r.item);
    if (!q || !r.id) continue;
    seen.set(r.id, (seen.get(r.id) ?? new Set()).add(q));
  }
  for (const [id, qs] of seen) if (qs.size === 1) out.set(id, [...qs][0]!);
  return out;
}

/**
 * Every connection of these things, both ways: what they follow and what follows them, what they
 * are based on and what was made from them, their series (with position) and franchise.
 */
export async function relationsOf(fetch: Fetch, qids: string[]): Promise<Relation[]> {
  if (!qids.length) return [];
  const rows = await sparql(
    fetch,
    `SELECT ?item ?rel ?other ?ord WHERE {
  VALUES ?item { ${values(qids)} }
  { ?item p:P179 ?st . ?st ps:P179 ?other . OPTIONAL { ?st pq:P1545 ?ord } BIND("series" AS ?rel) }
  UNION { ?item wdt:P155 ?other . BIND("follows" AS ?rel) }
  UNION { ?other wdt:P156 ?item . BIND("follows" AS ?rel) }
  UNION { ?item wdt:P156 ?other . BIND("followed_by" AS ?rel) }
  UNION { ?other wdt:P155 ?item . BIND("followed_by" AS ?rel) }
  UNION { ?item wdt:P144 ?other . BIND("based_on" AS ?rel) }
  UNION { ?other wdt:P4969 ?item . BIND("based_on" AS ?rel) }
  UNION { ?other wdt:P144 ?item . BIND("adapted_as" AS ?rel) }
  UNION { ?item wdt:P4969 ?other . BIND("adapted_as" AS ?rel) }
  UNION { ?item wdt:P8345 ?other . BIND("franchise" AS ?rel) }
}`,
  );
  return parseRelationRows(rows);
}

/** Turns query rows into relations in their stored direction, without duplicates or runaway lists. */
export function parseRelationRows(rows: Row[]): Relation[] {
  const out = new Map<string, Relation>();
  const perKind = new Map<string, number>();
  for (const r of rows) {
    const item = qidOf(r.item);
    const other = qidOf(r.other);
    if (!item || !other || item === other) continue;
    let rel: Relation;
    switch (r.rel) {
      case "series":
      case "follows":
      case "based_on":
      case "franchise":
        rel = { from: item, rel: r.rel, to: other };
        break;
      case "followed_by":
        rel = { from: other, rel: "follows", to: item };
        break;
      case "adapted_as":
        rel = { from: other, rel: "based_on", to: item };
        break;
      default:
        continue;
    }
    const ord = parseOrd(r.ord);
    if (rel.rel === "series" && ord != null) rel.ord = ord;
    const key = `${rel.from} ${rel.rel} ${rel.to}`;
    if (out.has(key)) {
      // Keep a position if any row had one.
      if (rel.ord != null && out.get(key)!.ord == null) out.get(key)!.ord = rel.ord;
      continue;
    }
    const kindKey = `${item} ${r.rel}`;
    const n = perKind.get(kindKey) ?? 0;
    if (n >= MAX_PER_KIND) continue;
    perKind.set(kindKey, n + 1);
    out.set(key, rel);
  }
  return [...out.values()];
}

/** "3" -> 3, "1.5" -> 1.5, "Book Two" -> undefined */
export function parseOrd(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const m = s.trim().match(/^\d+(?:\.\d+)?$/);
  return m ? Number(m[0]) : undefined;
}

/** The members of these series, with their positions, as `series` relations. */
export async function seriesMembers(fetch: Fetch, seriesQids: string[]): Promise<Relation[]> {
  if (!seriesQids.length) return [];
  const rows = await sparql(
    fetch,
    `SELECT ?item ?other ?ord WHERE {
  VALUES ?other { ${values(seriesQids)} }
  ?item p:P179 ?st . ?st ps:P179 ?other . OPTIONAL { ?st pq:P1545 ?ord }
}`,
  );
  const count = new Map<string, number>();
  const out: Relation[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const item = qidOf(r.item);
    const series = qidOf(r.other);
    if (!item || !series || seen.has(`${item} ${series}`)) continue;
    const n = count.get(series) ?? 0;
    if (n >= MAX_SERIES_MEMBERS) continue;
    count.set(series, n + 1);
    seen.add(`${item} ${series}`);
    const ord = parseOrd(r.ord);
    out.push({ from: item, rel: "series", to: series, ...(ord != null ? { ord } : {}) });
  }
  return out;
}

// What a Wikidata "instance of" (P31) says a thing is.
const TYPES: [WorkType, string[]][] = [
  ["franchise", ["Q196600"]],
  ["series", ["Q24856", "Q7058673", "Q277759", "Q1667921", "Q867335", "Q614101", "Q14406742", "Q21198342"]],
  ["show", ["Q5398426", "Q581714", "Q1259759", "Q63952888", "Q526877", "Q117467246", "Q15416"]],
  ["movie", ["Q11424", "Q202866", "Q24862", "Q506240", "Q93204", "Q1054574", "Q229390", "Q24869"]],
  ["game", ["Q7889", "Q21125433", "Q64170203", "Q865493"]],
  [
    "book",
    [
      "Q7725634",
      "Q571",
      "Q8261",
      "Q47461344",
      "Q49084",
      "Q1004",
      "Q725377",
      "Q5185279",
      "Q12308638",
      "Q149537",
      "Q1279564",
      "Q8274",
      "Q1760610",
      "Q2831984",
    ],
  ],
];

/** The first type that matches, in the order above (a "film series" is a series, not a movie). */
export function workType(instanceOf: string[]): WorkType {
  for (const [type, qids] of TYPES) if (instanceOf.some((q) => qids.includes(q))) return type;
  return "other";
}

/** Names, types, years and ids of these things, in batches of 200. */
export async function worksByQid(fetch: Fetch, qids: string[]): Promise<Work[]> {
  const list = [...new Set(qids.filter(isQid))];
  const out: Work[] = [];
  for (let i = 0; i < list.length; i += 200) {
    const rows = await sparql(
      fetch,
      `SELECT ?w (SAMPLE(COALESCE(?le, ?lm)) AS ?label) (GROUP_CONCAT(DISTINCT ?t; separator=" ") AS ?types)
  (MIN(YEAR(COALESCE(?d, ?s))) AS ?year) (SAMPLE(?i) AS ?imdb) (SAMPLE(?g) AS ?igdb) (SAMPLE(?o) AS ?ol) (SAMPLE(?al) AS ?author)
WHERE {
  VALUES ?w { ${values(list.slice(i, i + 200))} }
  OPTIONAL { ?w rdfs:label ?le FILTER(LANG(?le) = "en") }
  OPTIONAL { ?w rdfs:label ?lm FILTER(LANG(?lm) = "mul") }
  OPTIONAL { ?w wdt:P31 ?t }
  OPTIONAL { ?w wdt:P577 ?d }
  OPTIONAL { ?w wdt:P580 ?s }
  OPTIONAL { ?w wdt:P345 ?i }
  OPTIONAL { ?w wdt:P5794 ?g }
  OPTIONAL { ?w wdt:P648 ?o }
  OPTIONAL { ?w wdt:P50 ?a . ?a rdfs:label ?al FILTER(LANG(?al) = "en") }
} GROUP BY ?w`,
    );
    out.push(...parseWorkRows(rows));
  }
  return out;
}

export function parseWorkRows(rows: Row[]): Work[] {
  const out: Work[] = [];
  for (const r of rows) {
    const qid = qidOf(r.w);
    if (!qid) continue;
    const types = (r.types ?? "")
      .split(/\s+/)
      .map((t) => qidOf(t))
      .filter((q): q is string => !!q);
    const year = r.year ? Number(r.year) : NaN;
    out.push({
      qid,
      label: r.label?.trim() || qid,
      type: workType(types),
      ...(Number.isFinite(year) ? { year } : {}),
      ...(r.imdb ? { imdb: r.imdb } : {}),
      ...(r.igdb ? { igdb: r.igdb } : {}),
      ...(r.ol && /^OL\d+W$/.test(r.ol) ? { openLibrary: r.ol } : {}),
      ...(r.author ? { author: r.author } : {}),
    });
  }
  return out;
}

/** The things a batch of relations points at whose details we need, series first. */
export function seriesOf(relations: Relation[]): string[] {
  return [...new Set(relations.filter((r) => r.rel === "series").map((r) => r.to))];
}

// ---------- What a card shows ----------

/** A card in Orbit that is this thing. */
export interface OrbitRef {
  itemId: string;
  title: string;
  status: string;
}

export interface ConnectedWork extends Work {
  ord?: number;
  /** Cards in Orbit for this thing; empty when Sid doesn't track it. */
  inOrbit: OrbitRef[];
}

export interface SeriesView {
  series: Work;
  /** In reading / watching order: by position, then year. */
  members: ConnectedWork[];
  /** 1-based place of this thing in `members`, when it is one of them. */
  position?: number;
  /** The member right after this one. */
  next?: ConnectedWork;
}

export interface Connections {
  qid: string;
  series: SeriesView[];
  /** What this comes after (the original, for a sequel). */
  follows: ConnectedWork[];
  /** What comes after this (sequels). */
  followedBy: ConnectedWork[];
  /** What this was made from (the book, for a movie). */
  basedOn: ConnectedWork[];
  /** What was made from this (the movies, for a book). */
  adaptations: ConnectedWork[];
  franchises: Work[];
}

const WORK_TYPES = new Set<WorkType>(["movie", "show", "book", "game"]);
const isListItem = (label: string): boolean => /^list of\b/i.test(label.trim());

const byOrder = (a: ConnectedWork, b: ConnectedWork): number =>
  (a.ord ?? Infinity) - (b.ord ?? Infinity) ||
  (a.year ?? Infinity) - (b.year ?? Infinity) ||
  a.label.localeCompare(b.label);

/** The relations a card needs: everything touching `qid`, plus the members of its series. */
export function relationsNeeded(qid: string, relations: Relation[]): Relation[] {
  const series = new Set(relations.filter((r) => r.from === qid && r.rel === "series").map((r) => r.to));
  return relations.filter((r) => r.from === qid || r.to === qid || (r.rel === "series" && series.has(r.to)));
}

/** Everything connected to `qid`, ready for the card. */
export function connectionsFor(
  qid: string,
  relations: Relation[],
  works: Map<string, Work>,
  inOrbit: Map<string, OrbitRef[]>,
): Connections {
  const work = (q: string): Work => works.get(q) ?? { qid: q, label: q, type: "other" };
  const connected = (q: string, ord?: number): ConnectedWork => ({
    ...work(q),
    ...(ord != null ? { ord } : {}),
    inOrbit: inOrbit.get(q) ?? [],
  });
  /**
   * Sequels, sources and adaptations that are books, movies, shows or games and have a name: an
   * episode "based on" a novel, or an item Wikidata has no English name for, is noise on a card.
   */
  const list = (qs: string[]): ConnectedWork[] =>
    [...new Set(qs)]
      .map((q) => connected(q))
      .filter((w) => WORK_TYPES.has(w.type) && w.label !== w.qid)
      .sort(byOrder);
  /** A series' members in order. When some are books, movies, shows or games, other things in it are left out (an audiobook set, a sub-series). */
  const seriesList = (seriesQid: string): ConnectedWork[] => {
    const all = relations
      .filter((m) => m.rel === "series" && m.to === seriesQid)
      .map((m) => connected(m.from, m.ord))
      .filter((m, i, list) => list.findIndex((x) => x.qid === m.qid) === i);
    const typed = all.some((m) => m.qid !== qid && WORK_TYPES.has(m.type));
    return (typed ? all.filter((m) => (WORK_TYPES.has(m.type) && m.label !== m.qid) || m.qid === qid) : all).sort(
      byOrder,
    );
  };

  const seen = new Set<string>();
  const series: SeriesView[] = relations
    .filter((r) => r.from === qid && r.rel === "series")
    .map((r) => ({ r, members: seriesList(r.to) }))
    // Not a real series: a "list of ..." item, or one whose other members are all episodes or odd items.
    .filter(
      ({ r, members }) => !isListItem(work(r.to).label) && members.some((m) => m.qid !== qid && WORK_TYPES.has(m.type)),
    )
    // Wikidata sometimes has two items for one series ("Dune" and "Dune Chronicles"): show it once.
    .filter(({ members }) => {
      const key = members.map((m) => m.qid).join(" ");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ r, members }) => {
      const at = members.findIndex((m) => m.qid === qid);
      return {
        series: { ...work(r.to), ...(work(r.to).type === "other" ? { type: "series" as const } : {}) },
        members,
        ...(at >= 0 ? { position: at + 1 } : {}),
        ...(at >= 0 && members[at + 1] ? { next: members[at + 1] } : {}),
      };
    });

  return {
    qid,
    series,
    follows: list(relations.filter((r) => r.from === qid && r.rel === "follows").map((r) => r.to)),
    followedBy: list(relations.filter((r) => r.to === qid && r.rel === "follows").map((r) => r.from)),
    basedOn: list(relations.filter((r) => r.from === qid && r.rel === "based_on").map((r) => r.to)),
    adaptations: list(relations.filter((r) => r.to === qid && r.rel === "based_on").map((r) => r.from)),
    franchises: [...new Set(relations.filter((r) => r.from === qid && r.rel === "franchise").map((r) => r.to))].map(
      (q) => ({ ...work(q), ...(work(q).type === "other" ? { type: "franchise" as const } : {}) }),
    ),
  };
}

/** Whether there is anything to show. */
export const hasConnections = (c: Connections): boolean =>
  c.series.length +
    c.follows.length +
    c.followedBy.length +
    c.basedOn.length +
    c.adaptations.length +
    c.franchises.length >
  0;
