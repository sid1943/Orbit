import type { LiveStatus } from "./types.js";
import type { Fetch } from "./enrich.js";

/**
 * Live TV status from TVmaze (free, no key): is the show still running,
 * how many seasons, when is the next episode. Looked up by IMDb id.
 */
interface TvmShow {
  id: number; status?: string; image?: { medium?: string; original?: string } | null;
  _embedded?: {
    nextepisode?: { airdate?: string; name?: string; season?: number; number?: number };
    previousepisode?: { airdate?: string; season?: number; number?: number };
    seasons?: { number: number; premiereDate?: string | null }[];
  };
}

export interface TvLive { live: Omit<LiveStatus, "entityId">; coverUrl?: string; tvmazeId: number }

export async function tvmazeStatus(fetch: Fetch, imdb: string, now = Date.now()): Promise<TvLive | null> {
  const look = await fetch(`https://api.tvmaze.com/lookup/shows?imdb=${encodeURIComponent(imdb)}`, { headers: { Accept: "application/json" } });
  if (look.status === 404) return null;
  if (!look.ok) throw new Error(`TVmaze lookup failed: HTTP ${look.status}`);
  const base = (await look.json()) as TvmShow;
  const r = await fetch(`https://api.tvmaze.com/shows/${base.id}?embed[]=nextepisode&embed[]=previousepisode&embed[]=seasons`, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`TVmaze show failed: HTTP ${r.status}`);
  const s = (await r.json()) as TvmShow;
  const today = new Date(now).toISOString().slice(0, 10);
  const seasons = (s._embedded?.seasons ?? []).filter((x) => x.premiereDate && x.premiereDate <= today).length;
  const next = s._embedded?.nextepisode;
  const prev = s._embedded?.previousepisode;
  return {
    tvmazeId: s.id,
    ...(s.image?.medium ? { coverUrl: s.image.medium } : {}),
    live: {
      source: "tvmaze",
      ...(s.status ? { status: s.status } : {}),
      seasons,
      nextEpisode: next?.airdate ? { date: next.airdate, ...(next.name ? { name: next.name } : {}), ...(next.season ? { season: next.season } : {}), ...(next.number ? { number: next.number } : {}) } : null,
      lastEpisode: prev?.airdate ? { date: prev.airdate, ...(prev.season ? { season: prev.season } : {}), ...(prev.number ? { number: prev.number } : {}) } : null,
      checkedAt: now,
    },
  };
}

/** How long to wait before checking a show again. */
export function nextCheckAfter(live: Pick<LiveStatus, "status" | "nextEpisode">): number {
  const day = 86_400_000;
  if (live.nextEpisode) return day;            // something is coming: daily
  if (live.status === "Running" || live.status === "In Development" || live.status === "To Be Determined") return 3 * day;
  return 30 * day;                             // ended: monthly is plenty
}
