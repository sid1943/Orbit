import { qidOf, sparql } from "./connections.js";
import { splitYear, type Fetch } from "./enrich.js";
import { normalize } from "./text.js";
import type { Entity } from "./types.js";

/**
 * A second, stricter look for books and movies the first matching pass missed. Old list rows are
 * written every which way ("Indira Gandhi by Katherine frank", "Rabbit, Run (Updike)",
 * "Elsa Morante's A History", "The Age of Propaganda, Pratkanis, Aronson"), so each row is read as a
 * few possible title / author pairs, and a pair counts only when the source agrees on both: the
 * exact title (ignoring a leading "The" / "A", case and punctuation) and, when there is one, the
 * author's surname. Anything less stays unlinked: Sid wants nothing left in review.
 */

export interface TitleGuess {
  title: string;
  author?: string;
}

const UA = "Orbit/0.1 (personal tracker; https://github.com/sid1943/orbit)";

/** Tidies a row's text: curly quotes, stray dots, edition notes, "Title:Subtitle" spacing. */
export function tidyTitle(raw: string): string {
  return raw
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s*[,(]?\s*\b\d+(?:st|nd|rd|th)\s+ed(?:ition|\.)?\)?\s*$/i, "")
    .replace(/(\w):(\S)/g, "$1: $2")
    .replace(/\s+/g, " ")
    .replace(/^[\s"'.,;:-]+|[\s.,;:-]+$/g, "")
    .trim();
}

/** The key two titles are compared by: normalized, without a leading article. */
export const titleKey = (s: string): string => normalize(s).replace(/^(the|a|an) /, "");

const NAME = "[A-Z][\\w.'-]*(?: [A-Z][\\w.'-]*){0,3}";
const looksLikeName = (s: string): boolean => new RegExp(`^${NAME}$`).test(s.trim()) && s.trim().length <= 40;

/**
 * Possible title / author readings of a row, most likely first. Rows that read as chat rather than
 * a book ("… - u/someone", a Reddit link) give none.
 */
export function titleGuesses(raw: string): TitleGuess[] {
  if (/\bu\/\w|\br\/\w|https?:\/\//i.test(raw)) return [];
  const text = tidyTitle(raw);
  if (!text) return [];
  const out: TitleGuess[] = [];
  const add = (title: string | undefined, author?: string) => {
    const t = tidyTitle(title ?? "");
    const a = author ? tidyTitle(author) : undefined;
    if (t.length < 2 || out.some((g) => g.title === t && g.author === a)) return;
    out.push(a ? { title: t, author: a } : { title: t });
  };
  // "If you like X, check out Catch-22"
  const rec = text.match(/\b(?:check out|try|read)\s+(.+)$/i);
  if (rec && /\b(if you like|recommend)/i.test(text)) return titleGuesses(rec[1]!);

  const by = text.match(/^(.+?)\s+by\s+(.+)$/i);
  if (by) add(by[1], by[2]);
  const dash = text.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dash) {
    add(dash[1], dash[2]);
    add(dash[2], dash[1]);
  }
  const paren = text.match(/^(.+?)\s*\(([^()]+)\)$/);
  if (paren && looksLikeName(paren[2]!)) add(paren[1], paren[2]);
  const possessive = text.match(new RegExp(`^(${NAME})'s\\s+(.+)$`));
  // "Elsa Morante's A History", not "A Wise Man's Fear".
  if (possessive && !/^(the|a|an)\b/i.test(possessive[1]!)) add(possessive[2], possessive[1]);
  const quoted = text.match(/^([^"]+?)\s+"([^"]+)"?/);
  if (quoted && looksLikeName(quoted[1]!)) add(quoted[2], quoted[1]);
  const comma = text.match(/^(.+?),\s+([^,]+)(?:,.*)?$/);
  if (comma && looksLikeName(comma[2]!)) add(comma[1], comma[2]);
  // "How to become a straight A student Cal Newport": a name at the end with no separator.
  const tail = text.match(/^(.+\S)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+){1,2})$/);
  if (tail && tail[1]!.split(" ").length >= 2) add(tail[1], tail[2]);
  add(text);
  // "Title: Subtitle" is often written without the subtitle in the source, or the other way round.
  for (const g of [...out]) {
    const pre = g.title.match(/^(.+?):\s/)?.[1];
    if (pre) add(pre, g.author);
  }
  return out;
}

const surname = (name: string): string => normalize(name).split(" ").pop() ?? "";

/** Whether `names` (from the source) include the author given in the row, by surname. */
export function authorAgrees(given: string | undefined, names: readonly string[]): boolean {
  if (!given) return true;
  const want = normalize(given)
    .split(" ")
    .filter((w) => w.length > 1);
  if (!want.length) return false;
  return names.some((n) => {
    const words = normalize(n).split(" ");
    return want.includes(surname(n)) || want.every((w) => words.includes(w));
  });
}

const titlesAgree = (a: string, b: string): boolean => {
  const ka = titleKey(a);
  const kb = titleKey(b);
  return ka === kb || ka === titleKey(b.split(":")[0]!) || kb === titleKey(a.split(":")[0]!);
};

interface OlDoc {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  edition_count?: number;
}

/**
 * A sure Open Library match for one guess, or null. Searches everything (`q=`), which forgives
 * articles, apostrophes and word order, then checks the answer. With an author, the title and the
 * author must agree. Without one, the first result's title must agree, it must have some history
 * (3+ editions), and any other result with that title by someone else must be far smaller (a study
 * guide to it, say).
 */
export async function openLibrarySure(
  fetch: Fetch,
  guess: TitleGuess,
): Promise<{ entity: Partial<Entity>; coverUrl?: string } | null> {
  // A leading "The" / "A" throws the search off ("The island huxley" misses Huxley's "Island").
  const q = [guess.title.replace(/^(the|a|an)\s+/i, ""), guess.author].filter(Boolean).join(" ");
  const r = await fetch(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&fields=key,title,author_name,first_publish_year,cover_i,edition_count&limit=5`,
    { headers: { "User-Agent": UA, Accept: "application/json" } },
  );
  if (!r.ok) throw new Error(`Open Library search failed: HTTP ${r.status}`);
  const docs = ((await r.json()) as { docs?: OlDoc[] }).docs ?? [];
  const same = docs.filter((d) => titlesAgree(guess.title, d.title));
  let pick: OlDoc | undefined;
  if (guess.author) pick = same.find((d) => authorAgrees(guess.author, d.author_name ?? []));
  else {
    const first = docs[0];
    const editions = first?.edition_count ?? 0;
    const firstAuthor = surname(first?.author_name?.[0] ?? "");
    const rivals = same.filter((d) => surname(d.author_name?.[0] ?? "") !== firstAuthor);
    if (first && same[0] === first && editions >= 3 && rivals.every((d) => (d.edition_count ?? 0) * 5 < editions))
      pick = first;
  }
  if (!pick) return null;
  return {
    entity: {
      openLibrary: pick.key.replace("/works/", ""),
      label: pick.title,
      ...(pick.author_name?.[0] ? { author: pick.author_name[0] } : {}),
      ...(pick.first_publish_year ? { year: pick.first_publish_year } : {}),
    },
    ...(pick.cover_i ? { coverUrl: `https://covers.openlibrary.org/b/id/${pick.cover_i}-M.jpg` } : {}),
  };
}

/** The first sure Open Library match among a row's readings, trying at most `tries` of them. */
export async function rematchBook(
  fetch: Fetch,
  raw: string,
  tries = 3,
): Promise<{ entity: Partial<Entity>; coverUrl?: string } | null> {
  // Readings with an author first: they are the ones that can be sure.
  const guesses = titleGuesses(raw).sort((a, b) => Number(!!b.author) - Number(!!a.author));
  for (const g of guesses.slice(0, tries)) {
    const hit = await openLibrarySure(fetch, g);
    if (hit) return hit;
  }
  return null;
}

/**
 * Wikidata ids for books by title and author (for linked books whose Open Library id Wikidata
 * doesn't know). Up to 40 books per query. Sure only when exactly one work (not an edition) has
 * that title and an author with that surname, or one of them is clearly the best known (more
 * Wikipedia articles than the next).
 */
export async function wikidataBooksByTitle(
  fetch: Fetch,
  books: { id: string; title: string; author: string }[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const list = books.filter((b) => b.title.trim() && b.author.trim()).slice(0, 40);
  if (!list.length) return out;
  const lit = (s: string) => JSON.stringify(s.slice(0, 200));
  const rows = await sparql(
    fetch,
    `SELECT ?term ?item ?label ?author (COUNT(DISTINCT ?site) AS ?sites) WHERE {
  VALUES ?term { ${[...new Set(list.map((b) => b.title))].map(lit).join(" ")} }
  SERVICE wikibase:mwapi { bd:serviceParam wikibase:endpoint "www.wikidata.org"; wikibase:api "EntitySearch";
    mwapi:search ?term; mwapi:language "en"; mwapi:limit "7". ?item wikibase:apiOutputItem mwapi:item. }
  ?item wdt:P50 ?a . ?a rdfs:label ?author FILTER(LANG(?author) = "en")
  OPTIONAL { ?item rdfs:label ?label FILTER(LANG(?label) = "en") }
  FILTER NOT EXISTS { ?item wdt:P31 wd:Q3331189 }
  OPTIONAL { ?site schema:about ?item }
} GROUP BY ?term ?item ?label ?author`,
  );
  for (const b of list) {
    const hits = new Map<string, number>();
    for (const r of rows) {
      const q = qidOf(r.item);
      if (!q || r.term !== b.title || !r.label || !titlesAgree(b.title, r.label)) continue;
      if (!authorAgrees(b.author, [r.author ?? ""])) continue;
      hits.set(q, Math.max(hits.get(q) ?? 0, Number(r.sites ?? 0)));
    }
    const ranked = [...hits].sort((x, y) => y[1] - x[1]);
    if (ranked.length === 1 || (ranked.length > 1 && ranked[0]![1] > ranked[1]![1])) out.set(b.id, ranked[0]![0]);
  }
  return out;
}

/** Possible readings of a movie row: tidied, and without a trailing "(dir. …)" or note in brackets. */
export function movieGuesses(raw: string): { title: string; year?: number }[] {
  if (/\bu\/\w|https?:\/\//i.test(raw)) return [];
  const text = tidyTitle(raw);
  if (!text) return [];
  const out: { title: string; year?: number }[] = [];
  const add = (t: string) => {
    const s = splitYear(tidyTitle(t));
    if (s.title.length >= 2 && !out.some((o) => o.title === s.title && o.year === s.year)) out.push(s);
  };
  add(text);
  add(text.replace(/\s*\((?:dir\.?|directed by)[^)]*\)\s*/i, " "));
  add(text.replace(/\s*\[[^\]]*\]\s*/g, " "));
  return out;
}

/** Authors of Open Library works, by work id (up to 100 per call), for books saved without one. */
export async function openLibraryAuthors(fetch: Fetch, works: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const list = [...new Set(works.filter((w) => /^OL\d+W$/.test(w)))].slice(0, 100);
  if (!list.length) return out;
  const q = `key:(${list.map((w) => `"/works/${w}"`).join(" OR ")})`;
  const r = await fetch(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&fields=key,author_name&limit=${list.length}`,
    { headers: { "User-Agent": UA, Accept: "application/json" } },
  );
  if (!r.ok) throw new Error(`Open Library search failed: HTTP ${r.status}`);
  for (const d of ((await r.json()) as { docs?: { key?: string; author_name?: string[] }[] }).docs ?? []) {
    const work = d.key?.replace(/^\/works\//, "");
    if (work && d.author_name?.[0]) out.set(work, d.author_name[0]);
  }
  return out;
}
