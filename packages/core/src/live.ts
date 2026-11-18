import type { LiveStatus } from "./types.js";
import { UA, type Fetch } from "./enrich.js";

/**
 * Live facts from free sources that need no key:
 * - TVmaze: is a show still running, how many seasons, when is the next episode (by IMDb id).
 * - Wikidata: release dates of movies and games, closing dates of places (by Wikidata id, 50 at a time).
 * - Open Library: when a book first came out (by work id).
 * What to look up for which linked thing, and how often, is decided in `watch.ts`.
 */
interface TvmShow {
  id: number;
  status?: string;
  image?: { medium?: string; original?: string } | null;
  network?: { name?: string } | null;
  webChannel?: { name?: string } | null;
  _embedded?: {
    nextepisode?: { airdate?: string; name?: string; season?: number; number?: number };
    previousepisode?: { airdate?: string; season?: number; number?: number };
    seasons?: { number: number; premiereDate?: string | null }[];
  };
}

export interface TvLive {
  live: Omit<LiveStatus, "entityId">;
  coverUrl?: string;
  tvmazeId: number;
}

/**
 * A show's status from TVmaze. Pass `tvmazeId` from an earlier answer to skip the IMDb lookup
 * (one request instead of two). Null when TVmaze doesn't know the show.
 */
export async function tvmazeStatus(
  fetch: Fetch,
  imdb: string,
  now = Date.now(),
  tvmazeId?: number,
): Promise<TvLive | null> {
  let id = tvmazeId;
  if (!id) {
    const look = await fetch(`https://api.tvmaze.com/lookup/shows?imdb=${encodeURIComponent(imdb)}`, {
      headers: { Accept: "application/json" },
    });
    if (look.status === 404) return null;
    if (!look.ok) throw new Error(`TVmaze lookup failed: HTTP ${look.status}`);
    id = ((await look.json()) as TvmShow).id;
  }
  const r = await fetch(
    `https://api.tvmaze.com/shows/${id}?embed[]=nextepisode&embed[]=previousepisode&embed[]=seasons`,
    { headers: { Accept: "application/json" } },
  );
  if (r.status === 404 && tvmazeId) return tvmazeStatus(fetch, imdb, now);
  if (!r.ok) throw new Error(`TVmaze show failed: HTTP ${r.status}`);
  const s = (await r.json()) as TvmShow;
  const today = new Date(now).toISOString().slice(0, 10);
  const seasons = (s._embedded?.seasons ?? []).filter((x) => x.premiereDate && x.premiereDate <= today).length;
  const next = s._embedded?.nextepisode;
  const prev = s._embedded?.previousepisode;
  const network = s.webChannel?.name ?? s.network?.name;
  return {
    tvmazeId: s.id,
    ...(s.image?.medium ? { coverUrl: s.image.medium } : {}),
    live: {
      source: "tvmaze",
      ...(s.status ? { status: s.status } : {}),
      seasons,
      nextEpisode: next?.airdate
        ? {
            date: next.airdate,
            ...(next.name ? { name: next.name } : {}),
            ...(next.season ? { season: next.season } : {}),
            ...(next.number ? { number: next.number } : {}),
          }
        : null,
      lastEpisode: prev?.airdate
        ? {
            date: prev.airdate,
            ...(prev.season ? { season: prev.season } : {}),
            ...(prev.number ? { number: prev.number } : {}),
          }
        : null,
      ...(network ? { watchOn: { country: "US", stream: [], rent: [], buy: [], network } } : {}),
      checkedAt: now,
    },
  };
}

/** How long to wait before checking a show again. */
export function nextCheckAfter(live: Pick<LiveStatus, "status" | "nextEpisode">): number {
  const day = 86_400_000;
  if (live.nextEpisode) return day; // something is coming: daily
  if (live.status === "Running" || live.status === "In Development" || live.status === "To Be Determined")
    return 3 * day;
  return 30 * day; // ended: monthly is plenty
}

/** Dates Wikidata knows about a thing: first release (P577) and closing (P576 dissolved, P3999 closed). */
export interface WikidataDates {
  released?: string;
  closed?: string;
}

/** Most Wikidata ids one `wikidataDates` call takes (one request). */
export const WIKIDATA_BATCH = 50;

const QID = /^Q\d+$/;

/**
 * Release and closing dates for up to 50 Wikidata ids in one SPARQL request (the earliest date of each).
 * Every valid id asked for is in the answer, with no dates when Wikidata has none.
 */
export async function wikidataDates(fetch: Fetch, qids: readonly string[]): Promise<Map<string, WikidataDates>> {
  const ids = [...new Set(qids.filter((q) => QID.test(q)))].slice(0, WIKIDATA_BATCH);
  const out = new Map<string, WikidataDates>(ids.map((q) => [q, {}]));
  if (!ids.length) return out;
  const query = `SELECT ?item (MIN(?r) AS ?released) (MIN(?c) AS ?closed) WHERE {
VALUES ?item { ${ids.map((q) => `wd:${q}`).join(" ")} }
OPTIONAL { ?item wdt:P577 ?r }
OPTIONAL { { ?item wdt:P576 ?c } UNION { ?item wdt:P3999 ?c } }
} GROUP BY ?item`;
  const r = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, {
    headers: { "User-Agent": UA, Accept: "application/sparql-results+json" },
  });
  if (!r.ok) throw new Error(`Wikidata query failed: HTTP ${r.status}`);
  const body = (await r.json()) as {
    results?: { bindings?: Record<string, { value?: string } | undefined>[] };
  };
  for (const b of body.results?.bindings ?? []) {
    const q = b.item?.value?.split("/").pop();
    if (!q || !out.has(q)) continue;
    const released = wikidataDay(b.released?.value);
    const closed = wikidataDay(b.closed?.value);
    out.set(q, { ...(released ? { released } : {}), ...(closed ? { closed } : {}) });
  }
  return out;
}

/** "2027-05-01T00:00:00Z" → "2027-05-01". Anything else (blank nodes, odd values) → undefined. */
function wikidataDay(v: string | undefined): string | undefined {
  return v?.match(/^(\d{4}-\d{2}-\d{2})T/)?.[1];
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Open Library's free-text `first_publish_date` ("March 4, 2027", "2027", "2027-03-04")
 * as YYYY-MM-DD, YYYY-MM or YYYY. Undefined when there is no year in it.
 */
export function publishDate(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const iso = text.match(/\b(\d{4})-(\d{2})(?:-(\d{2}))?\b/);
  if (iso) return iso[3] ? `${iso[1]}-${iso[2]}-${iso[3]}` : `${iso[1]}-${iso[2]}`;
  const year = text.match(/\b(1\d{3}|2\d{3})\b/)?.[1];
  if (!year) return undefined;
  const m = MONTHS.findIndex((name) => text.toLowerCase().includes(name));
  if (m < 0) return year;
  const day = text.match(/\b(\d{1,2})\b(?!\d)/)?.[1];
  const mm = String(m + 1).padStart(2, "0");
  return day && Number(day) <= 31 ? `${year}-${mm}-${day.padStart(2, "0")}` : `${year}-${mm}`;
}

/** When a book first came out, from its Open Library work. Null when Open Library doesn't know the work. */
export async function openLibraryPublished(fetch: Fetch, workId: string): Promise<{ releaseDate?: string } | null> {
  const r = await fetch(`https://openlibrary.org/works/${encodeURIComponent(workId)}.json`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Open Library work failed: HTTP ${r.status}`);
  const w = (await r.json()) as { first_publish_date?: string };
  const releaseDate = publishDate(w.first_publish_date);
  return releaseDate ? { releaseDate } : {};
}
