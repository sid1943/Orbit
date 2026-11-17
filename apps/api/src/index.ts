import { app } from "./app.js";
import type { Env } from "./env.js";
import { runScheduledJobs } from "./jobs/index.js";

/** Worker entry: the API, and the cron set in wrangler.toml. */
export default {
  fetch: app.fetch,
  scheduled(_event, env, ctx) {
    ctx.waitUntil(runScheduledJobs(env).then((result) => console.log(JSON.stringify({ cron: "jobs", ...result }))));
  },
} satisfies ExportedHandler<Env>;
