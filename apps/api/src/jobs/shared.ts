import type { Fetch } from "@orbit/core";

export const HOUR = 3_600_000;

/**
 * The cron budget. On the free Workers plan one run may make 50 subrequests, and outside requests
 * (`fetch`) and D1 calls count together ("any request a Worker makes using the Fetch API or to
 * Cloudflare services like … D1"). A D1 `batch()` is one call. CPU time is 10 ms per run.
 *
 * Every 10 minutes (144 runs a day) the jobs share one `Budget` of 48, in this order:
 * 1. Changes since the last run (1 call): which linked things to re-plan, which pasted links to check.
 * 2. New cards (enrich queue): at most `ENRICH_CAP`, about 5 cards.
 * 3. Live watch: planning, then due checks (TVmaze, Wikidata, Open Library).
 * 4. The city rule (jobs/city-guide.ts): live watch leaves it `CITY_RESERVE`.
 * 5. Connections (jobs/connect-works.ts), when `CONNECT_COST` still fits beside the link check.
 * 6. Dead-link check, with at least `LINK_RESERVE` requests.
 */
export const CRON_BUDGET = 48;

/** Most the enrich queue may spend in one run, so the back-fill of old cards never starves live watch. */
export const ENRICH_CAP = 24;

/** Outside requests saved for the dead-link check, so live watch never starves it. */
export const LINK_RESERVE = 4;

/**
 * What a connections run may spend: up to 8 D1 calls (counted up front) and its Wikidata requests
 * (counted as they go). It only starts when this much is left besides the link check's share.
 */
export const CONNECT_DB_CALLS = 8;
export const CONNECT_COST = 18;

/** No outside request waits longer than this. */
const TIMEOUT_MS = 10_000;

export const workerFetch: Fetch = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });

export class OutOfBudget extends Error {
  constructor() {
    super("cron budget spent");
  }
}

/**
 * What a cron run may still spend. `fetch` counts each outside request and refuses past the limit;
 * D1 calls are counted by the jobs with `db()` just before they run (`run`, `all`, `first` or one `batch`).
 */
export class Budget {
  private remaining: number;

  constructor(
    limit: number = CRON_BUDGET,
    private readonly base: Fetch = workerFetch,
  ) {
    this.remaining = limit;
  }

  get left(): number {
    return this.remaining;
  }

  /** Whether `n` more subrequests fit. */
  has(n: number): boolean {
    return this.remaining >= n;
  }

  /** Count one D1 call (call just before running it). */
  db(): void {
    this.spend(1);
  }

  /** Count `n` subrequests up front (for a job that doesn't count its own D1 calls). */
  spend(n: number): void {
    if (this.remaining < n) throw new OutOfBudget();
    this.remaining -= n;
  }

  readonly fetch: Fetch = (url, init) => {
    if (this.remaining < 1) return Promise.reject(new OutOfBudget());
    this.remaining -= 1;
    return this.base(url, init);
  };
}
