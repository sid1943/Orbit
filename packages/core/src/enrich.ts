import type { Confidence, Entity, Item } from "./types.js";
import { normalize } from "./text.js";

/**
 * The enricher: given a new Item, find the real-world thing it is about
 * (IMDb title, Open Library work, IGDB game, map place) and how sure we are.
 *
 * It never talks to the network itself: callers pass a `fetch`, so the same rules
 * run in the Cloudflare Worker, in tests (with canned answers) and in local scripts.
 */

export type Fetch = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface EnrichResult {
  confidence: Confidence;
  entity: Omit<Entity, "id" | "updatedAt"> | null;
  /** Other plausible matches when confidence is "review" */
  alternatives: Partial<Entity>[];
  /** A cover image found on the way (Open Library, TVmaze or Wikimedia) */
  coverUrl?: string;
}

/** Who Orbit is, sent to the free sources that ask callers to say (Wikidata, Open Library). */
export const UA = "Orbit/0.1 (personal tracker; https://github.com/sid1943/orbit)";
const NONE: EnrichResult = { confidence: "none", entity: null, alternatives: [] };

/**
 * A list of things (a "1001 Movies" card, a "Europe" card full of places) is not itself one
 * real-world thing, so it never gets a link of its own; its checklist rows do.
 * A show's checklist of seasons doesn't count.
 */
export function isContainer(item: Partial<Pick<Item, "checklists">>): boolean {
  const lists = item.checklists ?? [];
  const rows = lists.reduce((n, c) => n + c.rows.length, 0);
  return rows >= 20 || lists.some((c) => !/^seasons?\b/i.test(c.name.trim()) && c.rows.length >= 5);
}

/** Which kind of lookup an item gets (null: none). */
export function enrichKind(
  item: Pick<Item, "kind"> & Partial<Pick<Item, "checklists">>,
): "movie" | "show" | "book" | "game" | "place" | null {
  if (isContainer(item)) return null;
  switch (item.kind) {
    case "Movie":
      return "movie";
    case "Show":
      return "show";
    case "Book":
      return "book";
    case "Game":
      return "game";
    case "Place":
      return "place";
    default:
      return null;
  }
}

/** "Dune (2021)" -> { title: "Dune", year: 2021 }; "Westworld (2016– )" -> { title: "Westworld", year: 2016 } */
export function splitYear(title: string): { title: string; year?: number } {
  const m = title.match(/^(.*?)\s*[([]\s*((?:18|19|20)\d{2})\s*(?:[-–—]\s*(?:(?:18|19|20)\d{2})?\s*)?[)\]]\s*$/);
  return m && m[1] ? { title: m[1].trim(), year: Number(m[2]) } : { title: title.trim() };
}

/** "Dune by Frank Herbert" / "Dune - Frank Herbert" -> { title, author } */
export function splitAuthor(title: string): { title: string; author?: string } {
  const m = title.match(/^(.*?)\s+(?:by|-|–|—)\s+(?:by\s+)?(.+)$/i);
  return m && m[1] && m[2] ? { title: m[1].trim(), author: m[2].trim() } : { title: title.trim() };
}

// ---------- Wikidata (movies, shows, games) ----------

const TYPE_QIDS: Record<"movie" | "show" | "game", Set<string>> = {
  movie: new Set(["Q11424", "Q202866", "Q24862", "Q506240", "Q93204", "Q1054574", "Q229390", "Q24869"]),
  show: new Set(["Q5398426", "Q581714", "Q1259759", "Q63952888", "Q526877", "Q117467246", "Q15416"]),
  game: new Set(["Q7889", "Q21125433", "Q64170203", "Q865493"]),
};
const TYPE_WORDS: Record<"movie" | "show" | "game", RegExp> = {
  movie: /\bfilm\b|\bmovie\b/i,
  show: /television|tv series|miniseries|web series|anime series|sitcom|docuseries/i,
  game: /video game/i,
};

interface WdSearchHit {
  id: string;
  label?: string;
  description?: string;
  match?: { text?: string };
}
interface WdClaim {
  mainsnak?: { datavalue?: { value?: unknown } };
}
interface WdEntity {
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  claims?: Record<string, WdClaim[]>;
  sitelinks?: Record<string, { title: string }>;
}

const claimValues = (e: WdEntity, p: string): unknown[] =>
  (e.claims?.[p] ?? []).map((c) => c.mainsnak?.datavalue?.value).filter((v) => v != null);
const claimString = (e: WdEntity, p: string): string | undefined => {
  const v = claimValues(e, p)[0];
  return typeof v === "string" ? v : undefined;
};
const claimIds = (e: WdEntity, p: string): string[] =>
  claimValues(e, p)
    .map((v) => (v as { id?: string }).id)
    .filter((x): x is string => !!x);
const claimYear = (e: WdEntity, ...ps: string[]): number | undefined => {
  for (const p of ps) {
    const v = claimValues(e, p)[0] as { time?: string } | undefined;
    const y = v?.time?.match(/^[+-](\d{4})/)?.[1];
    if (y) return Number(y);
  }
  return undefined;
};

async function getJson(fetch: Fetch, url: string): Promise<unknown> {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

/** Wikidata searches: the plain name search plus a full-text search limited to items with the right id. */
async function wikidataCandidates(
  fetch: Fetch,
  kind: "movie" | "show" | "game",
  title: string,
  year?: number,
): Promise<string[]> {
  const prop = kind === "game" ? "P5794" : "P345";
  const [a, b] = await Promise.all([
    getJson(
      fetch,
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&uselang=en&type=item&limit=10&search=${encodeURIComponent(title)}`,
    ) as Promise<{ search?: WdSearchHit[] }>,
    getJson(
      fetch,
      `https://www.wikidata.org/w/api.php?action=query&list=search&format=json&srlimit=10&srnamespace=0&srsearch=${encodeURIComponent(`${title}${year ? " " + year : ""} haswbstatement:${prop}`)}`,
    ) as Promise<{ query?: { search?: { title: string }[] } }>,
  ]);
  const ids = [...(a.search ?? []).map((h) => h.id), ...(b.query?.search ?? []).map((h) => h.title)];
  return [...new Set(ids)].filter((x) => /^Q\d+$/.test(x)).slice(0, 20);
}

async function wikidataMatch(
  fetch: Fetch,
  kind: "movie" | "show" | "game",
  rawTitle: string,
  givenYear?: number,
): Promise<EnrichResult> {
  const split = splitYear(rawTitle);
  const title = split.title;
  const year = split.year ?? givenYear;
  const want = normalize(title);
  const ids = await wikidataCandidates(fetch, kind, title, year);
  if (!ids.length) return NONE;
  const d = (await getJson(
    fetch,
    `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&languages=en|mul&sitefilter=enwiki&props=labels|descriptions|aliases|claims|sitelinks&ids=${ids.join("|")}`,
  )) as { entities?: Record<string, WdEntity & { aliases?: Record<string, { value: string }[]> }> };

  type Cand = Partial<Entity> & { exact: boolean; strong: boolean; yearOk: boolean };
  const cands: Cand[] = [];
  const images = new Map<string, string>();
  for (const id of ids) {
    const e = d.entities?.[id];
    if (!e) continue;
    const label = e.labels?.en?.value ?? e.labels?.mul?.value ?? "";
    const desc = e.descriptions?.en?.value ?? "";
    const strong = claimIds(e, "P31").some((q) => TYPE_QIDS[kind].has(q));
    const typed =
      strong || (TYPE_WORDS[kind].test(desc) && !/\b(season|episode|soundtrack|character|franchise)\b/i.test(desc));
    if (!typed) continue;
    const imdb = claimString(e, "P345");
    const igdb = claimString(e, "P5794");
    if (kind !== "game" && !imdb?.startsWith("tt")) continue;
    const y = claimYear(e, "P577", "P580");
    const image = claimString(e, "P18");
    if (image) images.set(id, image);
    const names = [label, ...[...(e.aliases?.en ?? []), ...(e.aliases?.mul ?? [])].map((x) => x.value)].map(normalize);
    cands.push({
      qid: id,
      label,
      description: desc,
      ...(y ? { year: y } : {}),
      ...(imdb ? { imdb } : {}),
      ...(igdb ? { igdb } : {}),
      ...(e.sitelinks?.enwiki ? { wikipedia: e.sitelinks.enwiki.title } : {}),
      exact: names.includes(want),
      strong,
      yearOk: year == null || y == null || Math.abs(y - year) <= 1,
    });
  }
  const strip = ({ exact: _e, strong: _s, yearOk: _y, ...rest }: Cand): Partial<Entity> => rest;
  // Best first: exact name, right year, typed by Wikidata itself (not just its description), then the label (not an alias).
  const score = (c: Cand) =>
    (c.exact ? 8 : 0) + (c.yearOk ? 4 : 0) + (c.strong ? 2 : 0) + (normalize(c.label ?? "") === want ? 1 : 0);
  const ranked = cands.filter((c) => c.yearOk).sort((x, y) => score(y) - score(x));
  const pick = ranked[0];
  if (!pick) return NONE;
  const rivals = ranked.filter((c) => c !== pick && c.exact && c.strong && (year == null || c.year === year));
  const sure =
    pick.exact &&
    pick.strong &&
    (rivals.length === 0 || (year != null && pick.year === year && rivals.every((c) => c.year !== year)));
  const image = pick.qid ? images.get(pick.qid) : undefined;
  return {
    confidence: sure ? "high" : "review",
    entity: { name: rawTitle, category: kind, confidence: sure ? "high" : "review", ...strip(pick) },
    alternatives: ranked
      .filter((c) => c !== pick)
      .slice(0, 4)
      .map(strip),
    ...(image
      ? { coverUrl: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image)}?width=400` }
      : {}),
  };
}

// ---------- Open Library (books) ----------

interface OlDoc {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
}

async function openLibraryMatch(fetch: Fetch, rawTitle: string, givenAuthor?: string): Promise<EnrichResult> {
  const split = splitAuthor(splitYear(rawTitle).title);
  const title = split.title;
  const author = split.author ?? givenAuthor;
  const qs = `title=${encodeURIComponent(title)}${author ? `&author=${encodeURIComponent(author)}` : ""}`;
  const r = (await getJson(
    fetch,
    `https://openlibrary.org/search.json?${qs}&fields=key,title,author_name,first_publish_year,cover_i&limit=5`,
  )) as { docs?: OlDoc[] };
  const docs = r.docs ?? [];
  if (!docs.length) return NONE;
  const want = normalize(title);
  const wantAuthor = author ? normalize(author) : null;
  const toEnt = (doc: OlDoc): Partial<Entity> => ({
    openLibrary: doc.key.replace("/works/", ""),
    label: doc.title,
    ...(doc.author_name?.[0] ? { author: doc.author_name[0] } : {}),
    ...(doc.first_publish_year ? { year: doc.first_publish_year } : {}),
  });
  const authorOk = (doc: OlDoc) =>
    !wantAuthor ||
    (doc.author_name ?? []).some((a) => {
      const n = normalize(a);
      return n === wantAuthor || n.split(" ").pop() === wantAuthor.split(" ").pop();
    });
  const first = docs[0]!;
  const exact = docs.find((doc) => normalize(doc.title) === want && authorOk(doc));
  const pick = exact ?? first;
  const sure = !!exact && (!!wantAuthor || exact === first);
  return {
    confidence: sure ? "high" : "review",
    entity: { name: rawTitle, category: "book", confidence: sure ? "high" : "review", ...toEnt(pick) },
    alternatives: docs
      .filter((doc) => doc !== pick)
      .slice(0, 4)
      .map(toEnt),
    ...(pick.cover_i ? { coverUrl: `https://covers.openlibrary.org/b/id/${pick.cover_i}-M.jpg` } : {}),
  };
}

// ---------- Places ----------

function placeMatch(item: Pick<Item, "title" | "props">): EnrichResult {
  const where = item.props["Location"] ?? item.props["City"] ?? item.props["Where"] ?? "";
  const mapQuery = [item.title, where].filter(Boolean).join(", ");
  return {
    confidence: "map",
    entity: {
      name: item.title,
      category: "natural_place",
      confidence: "map",
      mapQuery,
      ...(where ? { location: where } : {}),
    },
    alternatives: [],
  };
}

/**
 * Links already sitting in the item (an IMDb, Open Library or IGDB address in its notes or links)
 * are the surest match of all, and cost no lookups.
 */
export function linkFromText(kind: ReturnType<typeof enrichKind>, title: string, text: string): EnrichResult | null {
  const imdb = text.match(/imdb\.com\/title\/(tt\d{5,10})/i)?.[1];
  const ol = text.match(/openlibrary\.org\/works\/(OL\d+W)/i)?.[1];
  const igdb = text.match(/igdb\.com\/games\/([a-z0-9-]+)/i)?.[1];
  const make = (category: string, extra: Partial<Entity>): EnrichResult => ({
    confidence: "high",
    entity: { name: title, category, confidence: "high", ...extra },
    alternatives: [],
  });
  if ((kind === "movie" || kind === "show") && imdb) return make(kind, { imdb });
  if (kind === "book" && ol) return make("book", { openLibrary: ol });
  if (kind === "game" && igdb) return make("game", { igdb });
  return null;
}

type EnrichInput = Pick<Item, "kind" | "title" | "props"> &
  Partial<Pick<Item, "notes" | "links" | "attachments" | "checklists">>;

/** Find the linked thing for a new item. Throws only on network errors (the caller retries later). */
/** Is an old card worth a strict look-up? (It has a year, an author, or a link of its own.) */
export function backfillable(item: EnrichInput): boolean {
  const kind = enrichKind(item);
  if (!kind || kind === "place") return false;
  const text = [item.notes ?? "", ...[...(item.links ?? []), ...(item.attachments ?? [])].map((l) => l.url)].join("\n");
  if (linkFromText(kind, item.title, text)) return true;
  if (kind === "book") return splitAuthor(item.title).author != null || !!item.props["Author"];
  return splitYear(item.title).year != null || /\b(18|19|20)\d{2}\b/.test(item.props["Year"] ?? "");
}

export interface EnrichOptions {
  /**
   * Strict mode is for back-filling old cards: only sure links are kept, and a card without
   * a year (movies, shows, games) or an author (books) is not looked up at all. Old lists hold
   * many header cards ("Genre", "Pulitzer Prize") that would otherwise match the wrong thing.
   */
  strict?: boolean;
}

export async function enrichItem(fetch: Fetch, item: EnrichInput, opts: EnrichOptions = {}): Promise<EnrichResult> {
  const kind = enrichKind(item);
  if (!kind) return { confidence: "nolink", entity: null, alternatives: [] };
  const text = [item.notes ?? "", ...[...(item.links ?? []), ...(item.attachments ?? [])].map((l) => l.url)].join("\n");
  const own = linkFromText(kind, item.title, text);
  if (own) return own;
  if (kind === "place") return opts.strict ? NONE : placeMatch(item);
  const propYear = Number(item.props["Year"]?.match(/\b(18|19|20)\d{2}\b/)?.[0]) || undefined;
  if (opts.strict && !backfillable(item)) return NONE;
  const r =
    kind === "book"
      ? await openLibraryMatch(fetch, item.title, item.props["Author"])
      : await wikidataMatch(fetch, kind, item.title, propYear);
  return opts.strict && r.confidence !== "high" ? NONE : r;
}
