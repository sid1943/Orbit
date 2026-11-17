import type { Fetch } from "@orbit/core";

/**
 * The free Workers plan allows 50 outside requests and 50 database queries per run.
 * Each run (every 10 minutes) links 8 cards (up to 24 requests), checks 4 shows (8) and gathers
 * connections for 50 linked things (about 5 Wikidata queries), which stays under both.
 */
export const HOUR = 3_600_000;

export const workerFetch: Fetch = (url, init) => fetch(url, init);
