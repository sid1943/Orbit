/** Bindings the Worker gets from Cloudflare (wrangler.toml and secrets). */
export interface Env {
  DB: D1Database;
  /** Password for the API, set with `wrangler secret put API_TOKEN`. */
  API_TOKEN: string;
  /** TMDB API read access token (movies, where to watch). Optional: without it movies use Wikidata. */
  TMDB_TOKEN?: string;
  /** IGDB = a Twitch developer app's Client ID and Client Secret. Optional: without them games use Wikidata. */
  IGDB_CLIENT_ID?: string;
  IGDB_CLIENT_SECRET?: string;
}

/** Which keyed sources this Worker can use (secrets set with `wrangler secret put`, or `.dev.vars` locally). */
export const keyedSources = (env: Env) => ({
  tmdb: !!env.TMDB_TOKEN,
  igdb: !!env.IGDB_CLIENT_ID && !!env.IGDB_CLIENT_SECRET,
});

export type AppEnv = { Bindings: Env };
