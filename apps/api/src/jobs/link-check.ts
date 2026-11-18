import { isCheckable, linkAnswer, nextLinkState, probeLink, type Fetch } from "@orbit/core";
import type { Env } from "../env.js";
import type { Budget } from "./shared.js";
import { SINCE } from "./live-watch.js";

/**
 * Dead-link check for the links Sid pasted (rules in `packages/core/src/link-check.ts`).
 * New and removed links are found in the run's first call (`FIND_LINKS`, `DROP_LINKS`); this job
 * checks the ones that are due with whatever budget is left.
 */

/** Most links checked in one run (each costs 1 request, 2 when the site refuses HEAD). */
const LINKS_PER_RUN = 12;

/** Every address pasted on a card that changed since the last run, and every "Fix links" address. */
const PASTED_SINCE = `
  SELECT json_extract(l.value, '$.url') AS url, i.id AS owner FROM items i, json_each(i.data, '$.links') l
    WHERE i.updated_at >= ${SINCE} AND i.deleted = 0
  UNION ALL SELECT json_extract(a.value, '$.url'), i.id FROM items i, json_each(i.data, '$.attachments') a
    WHERE i.updated_at >= ${SINCE} AND i.deleted = 0
  UNION ALL SELECT json_extract(decision, '$.url'), entity_id FROM reviews
    WHERE at >= ${SINCE} AND json_extract(decision, '$.d') = 'fix' AND json_extract(decision, '$.url') IS NOT NULL`;

/** Adds new pasted links, to be checked on the next run (?1: now). A link already known keeps its state. */
export const FIND_LINKS = `INSERT INTO link_checks (url, owner, next_check)
  SELECT url, owner, ?1 FROM (${PASTED_SINCE}) WHERE url LIKE 'http%://%'
  ON CONFLICT(url) DO NOTHING`;

/** Forgets links taken off changed cards, unless another card still has them. */
export const DROP_LINKS = `DELETE FROM link_checks
  WHERE owner IN (SELECT id FROM items WHERE updated_at >= ${SINCE})
  AND url NOT IN (
    SELECT json_extract(l.value, '$.url') FROM items i, json_each(i.data, '$.links') l WHERE i.deleted = 0
    UNION SELECT json_extract(a.value, '$.url') FROM items i, json_each(i.data, '$.attachments') a WHERE i.deleted = 0
  )`;

const SAVE_LINKS = `UPDATE link_checks SET state = json_extract(j.value, '$.state'), http_status = json_extract(j.value, '$.status'),
    misses = json_extract(j.value, '$.misses'), next_check = json_extract(j.value, '$.next'), checked_at = ?2
  FROM json_each(?1) j WHERE link_checks.url = json_extract(j.value, '$.url')`;

/** Like the budget's fetch, but drops the page body unread so the connection is freed at once. */
function probeFetch(budget: Budget): Fetch {
  return async (url, init) => {
    const r = await budget.fetch(url, init);
    const body = (r as { body?: { cancel(): Promise<void> } | null }).body;
    if (body) void body.cancel().catch(() => undefined);
    return r;
  };
}

export async function runLinkChecks(
  env: Env,
  budget: Budget,
  now = Date.now(),
): Promise<{ checked: number; dead: number; waiting: number }> {
  // 1 call to read, 1 to save, and at least one link (up to 2 requests).
  if (!budget.has(4)) return { checked: 0, dead: 0, waiting: 0 };
  budget.db();
  const { results: due } = await env.DB.prepare(
    `SELECT url, misses FROM link_checks WHERE next_check IS NOT NULL AND next_check <= ? ORDER BY next_check LIMIT ?`,
  )
    .bind(now, LINKS_PER_RUN)
    .all<{ url: string; misses: number }>();
  const fetch = probeFetch(budget);
  const saved: { url: string; state: string; status: number | null; misses: number; next: number | null }[] = [];
  let dead = 0;
  for (const d of due) {
    if (!isCheckable(d.url)) {
      saved.push({ url: d.url, state: "skipped", status: null, misses: 0, next: null });
      continue;
    }
    if (!budget.has(1 + 2)) break; // keep the call that saves
    const status = await probeLink(fetch, d.url);
    const next = nextLinkState(d, linkAnswer(status), now);
    if (next.state === "dead") dead++;
    saved.push({ url: d.url, state: next.state, status, misses: next.misses, next: next.nextCheck });
  }
  if (saved.length) {
    budget.db();
    await env.DB.prepare(SAVE_LINKS).bind(JSON.stringify(saved), now).run();
  }
  return { checked: saved.length, dead, waiting: due.length - saved.length };
}
