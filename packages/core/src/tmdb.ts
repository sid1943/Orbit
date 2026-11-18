import type { Fetch } from "./enrich.js";
import type { LiveStatus, WatchOn } from "./types.js";

/**
 * TMDB (The Movie Database): free with an API read token (Sid's, kept as the Worker secret
 * `TMDB_TOKEN`, never in the repo). Gives a movie's US release dates (theatres, digital, physical),
 * where it streams or can be rented or bought (data from JustWatch, which must be credited wherever
 * it is shown) and its collection, which is how sequels show up. Shows get where to watch.
 */

const API = "https://api.themoviedb.org/3";
/** Sid's country for release dates and streaming (Sid, 2026-11-17). */
export const WATCH_COUNTRY = "US";
const DAY = 86_400_000;
/** A theatrical release this recent, with no digital release yet, counts as "in theatres". */
const IN_THEATRES_DAYS = 60;

const get = async (fetch: Fetch, token: string, path: string): Promise<unknown | null> => {
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`TMDB ${path.split("?")[0]} failed: HTTP ${r.status}`);
  return r.json();
};

/** TMDB ids for an IMDb id: the movie and / or the show. */
export async function tmdbFind(fetch: Fetch, token: string, imdb: string): Promise<{ movie?: number; tv?: number }> {
  const body = (await get(fetch, token, `/find/${encodeURIComponent(imdb)}?external_source=imdb_id`)) as {
    movie_results?: { id: number }[];
    tv_results?: { id: number }[];
  } | null;
  const movie = body?.movie_results?.[0]?.id;
  const tv = body?.tv_results?.[0]?.id;
  return { ...(movie ? { movie } : {}), ...(tv ? { tv } : {}) };
}

interface Provider {
  provider_name: string;
}
type ProvidersByCountry = Record<
  string,
  { link?: string; flatrate?: Provider[]; rent?: Provider[]; buy?: Provider[]; free?: Provider[]; ads?: Provider[] }
>;

/** Where to watch in one country, from TMDB's watch providers. */
export function watchOnFrom(results: ProvidersByCountry | undefined, country = WATCH_COUNTRY): WatchOn | undefined {
  const c = results?.[country];
  if (!c) return undefined;
  const names = (list?: Provider[]) => [...new Set((list ?? []).map((p) => p.provider_name))];
  const free = names([...(c.free ?? []), ...(c.ads ?? [])]);
  return {
    country,
    stream: names(c.flatrate),
    rent: names(c.rent),
    buy: names(c.buy),
    ...(free.length ? { free } : {}),
    ...(c.link ? { link: c.link } : {}),
  };
}

/** TMDB release types: 1 premiere, 2 limited, 3 theatrical, 4 digital, 5 physical, 6 TV. */
export function usReleases(
  results: { iso_3166_1: string; release_dates: { type: number; release_date: string }[] }[] | undefined,
  country = WATCH_COUNTRY,
): NonNullable<LiveStatus["releases"]> {
  const dates = results?.find((r) => r.iso_3166_1 === country)?.release_dates ?? [];
  const first = (...types: number[]) =>
    dates
      .filter((d) => types.includes(d.type) && d.release_date)
      .map((d) => d.release_date.slice(0, 10))
      .sort()[0];
  const theatrical = first(3, 2);
  const digital = first(4);
  const physical = first(5);
  return {
    ...(theatrical ? { theatrical } : {}),
    ...(digital ? { digital } : {}),
    ...(physical ? { physical } : {}),
  };
}

export interface TmdbMovie {
  live: Omit<LiveStatus, "entityId">;
  collectionId?: number;
  posterUrl?: string;
}

/** A movie's US releases, where to watch it, and its collection id. One request. */
export async function tmdbMovie(
  fetch: Fetch,
  token: string,
  tmdbId: number,
  now = Date.now(),
): Promise<TmdbMovie | null> {
  const m = (await get(fetch, token, `/movie/${tmdbId}?append_to_response=release_dates,watch/providers`)) as {
    status?: string;
    release_date?: string;
    poster_path?: string | null;
    belongs_to_collection?: { id: number } | null;
    release_dates?: { results?: Parameters<typeof usReleases>[0] };
    "watch/providers"?: { results?: ProvidersByCountry };
  } | null;
  if (!m) return null;
  const releases = usReleases(m.release_dates?.results);
  const watchOn = watchOnFrom(m["watch/providers"]?.results);
  const today = new Date(now).toISOString().slice(0, 10);
  const recent = new Date(now - IN_THEATRES_DAYS * DAY).toISOString().slice(0, 10);
  const inTheatres =
    !!releases.theatrical && releases.theatrical <= today && releases.theatrical >= recent && !releases.digital;
  const releaseDate = releases.theatrical ?? releases.digital ?? m.release_date ?? undefined;
  return {
    live: {
      source: "tmdb",
      ...(m.status ? { status: m.status } : {}),
      ...(releaseDate ? { releaseDate } : {}),
      releases,
      inTheatres,
      ...(watchOn ? { watchOn } : {}),
      checkedAt: now,
    },
    ...(m.belongs_to_collection?.id ? { collectionId: m.belongs_to_collection.id } : {}),
    ...(m.poster_path ? { posterUrl: `https://image.tmdb.org/t/p/w342${m.poster_path}` } : {}),
  };
}

/** A collection's parts in release order (undated, i.e. announced, ones last). One request. */
export async function tmdbCollection(
  fetch: Fetch,
  token: string,
  id: number,
): Promise<NonNullable<LiveStatus["collection"]> | null> {
  const c = (await get(fetch, token, `/collection/${id}`)) as {
    id: number;
    name: string;
    parts?: { id: number; title: string; release_date?: string }[];
  } | null;
  if (!c) return null;
  const parts = (c.parts ?? [])
    .map((p) => ({ tmdbId: p.id, title: p.title, ...(p.release_date ? { releaseDate: p.release_date } : {}) }))
    .sort((a, b) => (a.releaseDate ?? "9999").localeCompare(b.releaseDate ?? "9999"));
  return { id: c.id, name: c.name, parts };
}

/** Where to watch a show. One request. */
export async function tmdbTvWatch(fetch: Fetch, token: string, tvId: number): Promise<WatchOn | undefined> {
  const body = (await get(fetch, token, `/tv/${tvId}/watch/providers`)) as { results?: ProvidersByCountry } | null;
  return watchOnFrom(body?.results);
}
