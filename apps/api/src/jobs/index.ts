import type { Env } from "../env.js";
import { runEnrichQueue } from "./enrich-queue.js";
import { refreshShows } from "./refresh-shows.js";

export { enqueue, runEnrichQueue } from "./enrich-queue.js";
export { refreshShows } from "./refresh-shows.js";

/** Everything the 10-minute cron does, in order. */
export async function runScheduledJobs(env: Env) {
  const items = await runEnrichQueue(env);
  const shows = await refreshShows(env);
  return { items, shows };
}
