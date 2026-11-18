import { sparql, qidOf } from "./connections.js";
import type { Fetch } from "./enrich.js";

/**
 * Goodreads ids for books, so the book's link opens its Goodreads page (Sid, 2026-11-17: Goodreads
 * for every book). Goodreads has no public API, so the ids come from two free sources that record them:
 * Wikidata (work id `P8383`, book id `P2969`) and Open Library (`id_goodreads` on its editions).
 */

export interface GoodreadsIds {
  /** Goodreads work id: the link opens the best-known edition. */
  work?: string;
  /** Goodreads book (edition) id. */
  book?: string;
}

const UA = "Orbit/0.1 (personal tracker; https://github.com/sid1943/orbit)";
const digits = (s: string | undefined): string | undefined => (s && /^\d+$/.test(s) ? s : undefined);

/** Goodreads ids recorded on Wikidata, by Wikidata id. */
export async function goodreadsByQid(fetch: Fetch, qids: string[]): Promise<Map<string, GoodreadsIds>> {
  const out = new Map<string, GoodreadsIds>();
  const list = [...new Set(qids.filter((q) => /^Q\d+$/.test(q)))];
  if (!list.length) return out;
  const rows = await sparql(
    fetch,
    `SELECT ?item (SAMPLE(?w) AS ?work) (SAMPLE(?b) AS ?book) WHERE {
  VALUES ?item { ${list.map((q) => `wd:${q}`).join(" ")} }
  OPTIONAL { ?item wdt:P8383 ?w }
  OPTIONAL { ?item wdt:P2969 ?b }
} GROUP BY ?item`,
  );
  for (const r of rows) {
    const q = qidOf(r.item);
    const work = digits(r.work);
    const book = digits(r.book);
    if (q && (work || book)) out.set(q, { ...(work ? { work } : {}), ...(book ? { book } : {}) });
  }
  return out;
}

/** Goodreads book ids recorded on Open Library editions, by Open Library work id (up to 100 per call). */
export async function goodreadsByOpenLibrary(fetch: Fetch, works: string[]): Promise<Map<string, GoodreadsIds>> {
  const out = new Map<string, GoodreadsIds>();
  const list = [...new Set(works.filter((w) => /^OL\d+W$/.test(w)))].slice(0, 100);
  if (!list.length) return out;
  const q = `key:(${list.map((w) => `"/works/${w}"`).join(" OR ")})`;
  const r = await fetch(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&fields=key,id_goodreads&limit=${list.length}`,
    { headers: { "User-Agent": UA, Accept: "application/json" } },
  );
  if (!r.ok) throw new Error(`Open Library search failed: HTTP ${r.status}`);
  const json = (await r.json()) as { docs?: { key?: string; id_goodreads?: string[] }[] };
  for (const d of json.docs ?? []) {
    const work = d.key?.replace(/^\/works\//, "");
    // Editions come in no set order; the lowest id is usually the oldest, best-known one.
    const ids = (d.id_goodreads ?? []).map(digits).filter((x): x is string => !!x);
    const book = ids.sort((a, b) => Number(a) - Number(b))[0];
    if (work && book) out.set(work, { book });
  }
  return out;
}
