import type { Fetch } from "./enrich.js";
import type { LiveStatus } from "./types.js";

/**
 * IGDB (the games database, run by Twitch): free with a Twitch developer app's Client ID and Client
 * Secret (Sid's, kept as the Worker secrets `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET`, never in the repo).
 * Gives a game's development status, release date per platform and platforms, for up to 50 games
 * per request, looked up by the IGDB slug of Orbit's standard link.
 */

const DAY = 86_400_000;
export const IGDB_BATCH = 50;

export interface TwitchToken {
  token: string;
  /** ms since epoch */
  expiresAt: number;
}

/** An app access token (client credentials). Lasts about 60 days; kept and reused until a day before it ends. */
export async function twitchToken(
  fetch: Fetch,
  clientId: string,
  secret: string,
  now = Date.now(),
): Promise<TwitchToken> {
  const r = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(secret)}&grant_type=client_credentials`,
    { method: "POST" },
  );
  if (!r.ok) throw new Error(`Twitch token failed: HTTP ${r.status}`);
  const b = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!b.access_token) throw new Error("Twitch token missing in answer");
  return { token: b.access_token, expiresAt: now + (b.expires_in ?? 86_400) * 1000 };
}

export const tokenUsable = (t: TwitchToken | null | undefined, now = Date.now()): t is TwitchToken =>
  !!t && t.expiresAt - DAY > now;

interface IgdbGame {
  slug?: string;
  first_release_date?: number;
  game_status?: { status?: string } | null;
  platforms?: { name?: string }[];
  release_dates?: { date?: number; human?: string; platform?: { name?: string }; status?: { name?: string } }[];
}

const day = (unixSeconds?: number) =>
  unixSeconds ? new Date(unixSeconds * 1000).toISOString().slice(0, 10) : undefined;

/** A game's live facts from an IGDB answer. Without a status, a past first release counts as released. */
export function igdbLive(g: IgdbGame, now = Date.now()): Omit<LiveStatus, "entityId"> {
  const releaseDate = day(g.first_release_date);
  const today = new Date(now).toISOString().slice(0, 10);
  const devStatus =
    g.game_status?.status ?? (releaseDate ? (releaseDate <= today ? "Released" : "Announced") : "In development");
  const platformReleases = (g.release_dates ?? [])
    .filter((r) => r.platform?.name)
    .map((r) => ({
      platform: r.platform!.name!,
      ...(day(r.date) ? { date: day(r.date) } : r.human ? { date: r.human } : {}),
      ...(r.status?.name ? { status: r.status.name } : {}),
    }))
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
  const platforms = [...new Set((g.platforms ?? []).map((p) => p.name).filter((n): n is string => !!n))];
  return {
    source: "igdb",
    devStatus,
    ...(releaseDate ? { releaseDate } : {}),
    ...(platforms.length ? { platforms } : {}),
    ...(platformReleases.length ? { platformReleases } : {}),
    checkedAt: now,
  };
}

/** Live facts for up to 50 games by slug, in one request. Slugs IGDB doesn't know are missing from the map. */
export async function igdbGames(
  fetch: Fetch,
  clientId: string,
  token: string,
  slugs: readonly string[],
  now = Date.now(),
): Promise<Map<string, Omit<LiveStatus, "entityId">>> {
  const list = [...new Set(slugs.filter((s) => /^[a-z0-9-]+$/.test(s)))].slice(0, IGDB_BATCH);
  const out = new Map<string, Omit<LiveStatus, "entityId">>();
  if (!list.length) return out;
  const r = await fetch("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: { "Client-ID": clientId, Authorization: `Bearer ${token}`, Accept: "application/json" },
    body: `fields slug,first_release_date,game_status.status,platforms.name,release_dates.date,release_dates.human,release_dates.platform.name,release_dates.status.name; where slug = (${list.map((s) => `"${s}"`).join(",")}); limit ${IGDB_BATCH};`,
  });
  if (!r.ok) throw new Error(`IGDB games failed: HTTP ${r.status}`);
  for (const g of (await r.json()) as IgdbGame[]) if (g.slug) out.set(g.slug, igdbLive(g, now));
  return out;
}
