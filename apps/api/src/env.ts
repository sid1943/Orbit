/** Bindings the Worker gets from Cloudflare (wrangler.toml and secrets). */
export interface Env {
  DB: D1Database;
  /** Password for the API, set with `wrangler secret put API_TOKEN`. */
  API_TOKEN: string;
}

export type AppEnv = { Bindings: Env };
