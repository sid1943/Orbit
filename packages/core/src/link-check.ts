import { UA, type Fetch } from "./enrich.js";
import type { Item, ReviewDecision } from "./types.js";

/**
 * Dead-link check for links Sid pasted: a card's Useful links and attachments, and the links he
 * typed in "Fix links". Standard links (IMDb, Open Library...) are built from ids and aren't checked.
 *
 * A link is only called dead after three "gone" answers at least a week apart, so a site that is
 * down for a day is never flagged. Sites that refuse robots (401, 403, 429) are "blocked": Orbit can't
 * tell, so they are never called dead.
 */

/**
 * `new`: not checked yet. `ok`: answers. `unsure`: gone or failing, being re-checked.
 * `blocked`: the site refuses robots, so Orbit can't tell. `dead`: gone three times, no longer checked.
 * `skipped`: not a web address that can be checked.
 */
export type LinkState = "new" | "ok" | "unsure" | "blocked" | "dead" | "skipped";

/** What one request said. */
export type LinkAnswer = "ok" | "gone" | "blocked";

export interface LinkCheck {
  url: string;
  state: LinkState;
  /** Last HTTP status, or null when the site didn't answer at all. */
  httpStatus: number | null;
  misses: number;
  checkedAt: number | null;
  /** Null once a link is dead. */
  nextCheck: number | null;
}

const DAY = 86_400_000;
export const LINK_RECHECK_OK = 90 * DAY;
export const LINK_RECHECK_UNSURE = 7 * DAY;
export const LINK_GONE_TIMES = 3;

/** Only real web addresses are checked. */
export function isCheckable(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && !!u.hostname && u.hostname !== "localhost";
  } catch {
    return false;
  }
}

/** The web addresses Sid pasted on a card (Useful links and attachments), without repeats. */
export function pastedLinks(item: Pick<Item, "links" | "attachments">): string[] {
  const out = new Set<string>();
  for (const l of [...(item.links ?? []), ...(item.attachments ?? [])])
    if (l?.url && isCheckable(l.url)) out.add(l.url);
  return [...out];
}

/** The address Sid typed in "Fix links", if any. */
export function fixLink(decision: ReviewDecision | null | undefined): string | null {
  return decision?.d === "fix" && decision.url && isCheckable(decision.url) ? decision.url : null;
}

/** What an HTTP status means for a pasted link. `null` = no answer (name not found, refused, timed out). */
export function linkAnswer(status: number | null): LinkAnswer {
  if (status === null) return "gone";
  if (status === 401 || status === 403 || status === 429 || status === 999) return "blocked";
  if (status < 400) return "ok";
  return "gone"; // 404, 410, and servers that keep failing (5xx)
}

/** The link's state after one more answer. */
export function nextLinkState(
  prev: Pick<LinkCheck, "misses">,
  answer: LinkAnswer,
  now = Date.now(),
): Pick<LinkCheck, "state" | "misses" | "nextCheck"> {
  if (answer === "ok") return { state: "ok", misses: 0, nextCheck: now + LINK_RECHECK_OK };
  if (answer === "blocked") return { state: "blocked", misses: 0, nextCheck: now + LINK_RECHECK_OK };
  const misses = prev.misses + 1;
  return misses >= LINK_GONE_TIMES
    ? { state: "dead", misses, nextCheck: null }
    : { state: "unsure", misses, nextCheck: now + LINK_RECHECK_UNSURE };
}

/**
 * Ask a site whether a page is still there: HEAD first (no page download), then GET for
 * sites that don't take HEAD. Returns the HTTP status, or null when the site didn't answer.
 */
export async function probeLink(fetch: Fetch, url: string): Promise<number | null> {
  const headers = { "User-Agent": UA, Accept: "text/html,*/*" };
  try {
    const head = await fetch(url, { method: "HEAD", headers });
    if (head.status !== 405 && head.status !== 501 && head.status !== 400 && head.status !== 403) return head.status;
    const get = await fetch(url, { method: "GET", headers });
    return get.status;
  } catch {
    return null;
  }
}
