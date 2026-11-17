import type { Env } from "../env.js";
import { connectWorks } from "./connect-works.js";
import { runEnrichQueue } from "./enrich-queue.js";
import { refreshShows } from "./refresh-shows.js";

export { enqueue, runEnrichQueue } from "./enrich-queue.js";
export { refreshShows } from "./refresh-shows.js";
export { connectProgress, connectWorks } from "./connect-works.js";

/** Everything the 10-minute cron does, in order. */
export async function runScheduledJobs(env: Env) {
  const items = await runEnrichQueue(env);
  const shows = await refreshShows(env);
  const connections = await connectWorks(env);
  return { items, shows, connections };
}
