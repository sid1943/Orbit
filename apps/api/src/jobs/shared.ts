import type { Fetch } from "@orbit/core";

/**
 * The free Workers plan allows 50 outside requests and 50 database queries per run.
 * Each run (every 10 minutes) links 8 cards and checks 4 shows, which stays under both:
 * about 1,150 cards and 575 show checks a day.
 */
export const HOUR = 3_600_000;

export const workerFetch: Fetch = (url, init) => fetch(url, init);
