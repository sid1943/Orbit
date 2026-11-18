import type { Env } from "../env.js";
import { connectWorks } from "./connect-works.js";
import { runEnrichQueue } from "./enrich-queue.js";
import { DROP_LINKS, FIND_LINKS, runLinkChecks } from "./link-check.js";
import { MARK_CHANGED, runLiveWatch } from "./live-watch.js";
import { Budget, CONNECT_COST, CONNECT_DB_CALLS, LINK_RESERVE } from "./shared.js";

export { enqueue, runEnrichQueue } from "./enrich-queue.js";
export { checkDue, planWatch, runLiveWatch } from "./live-watch.js";
export { runLinkChecks } from "./link-check.js";
export { Budget } from "./shared.js";
export { connectProgress, connectWorks } from "./connect-works.js";

/**
 * What changed since the last run, in one database call: linked things to re-plan, pasted links
 * to add or drop, then the new "since" time (statements in a batch run in order, in one transaction).
 */
async function noteChanges(env: Env, budget: Budget, now: number): Promise<void> {
  budget.db();
  await env.DB.batch([
    env.DB.prepare(MARK_CHANGED),
    env.DB.prepare(DROP_LINKS),
    env.DB.prepare(FIND_LINKS).bind(now),
    env.DB.prepare(
      `INSERT INTO job_state (key, value) VALUES ('changes_since', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).bind(String(now)),
  ]);
}

/** Everything the 10-minute cron does, in order, within one budget (see jobs/shared.ts). */
export async function runScheduledJobs(env: Env, now = Date.now(), budget = new Budget()) {
  await noteChanges(env, budget, now);
  const items = await runEnrichQueue(env, now, budget);
  const watch = await runLiveWatch(env, budget, now);
  // Connections are gathered when the run has room for them besides the link check's share.
  let connections = null;
  if (budget.has(CONNECT_COST + 2 + LINK_RESERVE)) {
    budget.spend(CONNECT_DB_CALLS);
    connections = await connectWorks(env, now, budget.fetch);
  }
  const links = await runLinkChecks(env, budget, now);
  return { items, watch, connections, links, budgetLeft: budget.left };
}
