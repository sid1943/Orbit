import type { Entity, LiveStatus, Status } from "./types.js";

/**
 * Live watch: the app decides for itself what each linked thing needs, with no settings per card.
 *
 * For every linked thing there is one rule (`watchRule`): what to watch, from which free source,
 * and whether there is anything to watch at all. After each check, `afterCheck` says when to look
 * again or that it is time to stop. The Worker's scheduler (`apps/api/src/jobs/live-watch.ts`)
 * only follows these rules and spends the cron budget.
 *
 * | Linked thing                   | Watches                               | Source       | Stops when                          |
 * | ------------------------------ | ------------------------------------- | ------------ | ----------------------------------- |
 * | Show (IMDb id)                 | seasons, next episode, where to watch | TVmaze, TMDB | dropped                             |
 * | Movie (IMDb id), with TMDB     | theatres, streaming, sequels          | TMDB         | watched, or dropped                 |
 * | Game (IGDB slug), with IGDB    | development status, dates, platforms  | IGDB         | played, cancelled, or dropped       |
 * | Movie, game not yet out        | release date (no TMDB / IGDB key)     | Wikidata     | released, or watched / played       |
 * | Book not yet out               | first publication date                | Open Library | published, or read                  |
 * | Place that can close (Wikidata)| closing date                          | Wikidata     | closed, or visited                  |
 * | Anything else                  | nothing                               | —            | at once                             |
 */

export type WatchWhat = "tv" | "movie" | "game" | "release" | "publish" | "closure" | "none";
export type WatchSource = "tvmaze" | "tmdb" | "igdb" | "wikidata" | "openlibrary";

/** Sources that need Sid's keys, and whether the Worker has them (see `docs/SETUP.md`). */
export interface KeyedSources {
  tmdb: boolean;
  igdb: boolean;
}
const NO_KEYS: KeyedSources = { tmdb: false, igdb: false };

/** Why a linked thing is no longer watched. */
export type StopReason =
  | "removed" // no card or row points at it any more (or they're archived / deleted)
  | "dropped" // Sid dropped it
  | "done" // watched, read, played or visited, and nothing more can come
  | "not-linked" // no sure link (waiting for review, rejected, nothing found, no link needed)
  | "no-source" // linked, but not to anything the free sources know (no IMDb / Wikidata / Open Library id)
  | "nothing-to-watch" // a kind of thing that doesn't change (a natural place, a recipe...)
  | "released" // movie or game is out
  | "published" // book is out
  | "ended" // show ended over a year ago (no longer used: ended shows are kept for where to watch)
  | "cancelled" // game cancelled
  | "closed" // place closed for good
  | "unknown-at-source"; // the source said three times that it doesn't know this id

/** What happens to a linked thing next: watched from `source` by `key`, or stopped. */
export interface WatchPlan {
  what: WatchWhat;
  source: WatchSource | null;
  /** The id the source knows it by: IMDb id (TVmaze), Wikidata id, Open Library work id. */
  key: string | null;
  stop: StopReason | null;
}

/** A card or checklist row that points at a linked thing. */
export interface WatchOwner {
  status: Status | string;
  archived: boolean;
  deleted: boolean;
  /** Set for a checklist row: whether the row is ticked. */
  rowDone?: boolean | null;
}

export type OwnerState = "open" | "done" | "dropped" | "gone";

const RANK: Record<OwnerState, number> = { gone: 0, dropped: 1, done: 2, open: 3 };

/**
 * One state for everything pointing at a linked thing: the liveliest one wins
 * (a movie still open on one list is watched even if it's ticked on another).
 */
export function ownerState(owners: readonly WatchOwner[]): OwnerState {
  let best: OwnerState = "gone";
  for (const o of owners) {
    const s: OwnerState =
      o.deleted || o.archived
        ? "gone"
        : o.status === "dropped"
          ? "dropped"
          : o.rowDone || o.status === "done"
            ? "done"
            : "open";
    if (RANK[s] > RANK[best]) best = s;
  }
  return best;
}

/** Place categories that can close for good (a restaurant can; a canyon or a district can't). */
export const CLOSABLE = new Set(["eatery", "burger", "museum", "ballpark", "building", "nyc_building"]);

const stopped = (what: WatchWhat, stop: StopReason): WatchPlan => ({ what, source: null, key: null, stop });

/**
 * What a linked thing needs. `e` is the thing as shown (Sid's review answer applied, see `applyReview`).
 * Decided without any outside request: things that can't change stop here and cost nothing.
 */
export function watchRule(e: Entity, owner: OwnerState, now = Date.now(), keys: KeyedSources = NO_KEYS): WatchPlan {
  const thisYear = new Date(now).getUTCFullYear();
  const what: WatchWhat =
    e.category === "show"
      ? "tv"
      : e.category === "movie" && keys.tmdb && e.imdb
        ? "movie"
        : e.category === "game" && keys.igdb && e.igdb
          ? "game"
          : e.category === "movie" || e.category === "game"
            ? "release"
            : e.category === "book"
              ? "publish"
              : CLOSABLE.has(e.category)
                ? "closure"
                : "none";
  if (owner === "gone") return stopped(what, "removed");
  if (owner === "dropped") return stopped(what, "dropped");
  if (what === "none") return stopped(what, "nothing-to-watch");
  if (e.confidence !== "high" && e.confidence !== "user") return stopped(what, "not-linked");
  switch (what) {
    case "tv":
      // A finished show can still come back, so "done" keeps watching it.
      return e.imdb ? { what, source: "tvmaze", key: e.imdb, stop: null } : stopped(what, "no-source");
    case "movie":
      // Streaming changes for old movies too, so any movie Sid hasn't seen is watched.
      return owner === "done" ? stopped(what, "done") : { what, source: "tmdb", key: e.imdb!, stop: null };
    case "game":
      return owner === "done" ? stopped(what, "done") : { what, source: "igdb", key: e.igdb!, stop: null };
    case "release":
      if (owner === "done") return stopped(what, "done");
      if (e.year && e.year < thisYear) return stopped(what, "released");
      return e.qid ? { what, source: "wikidata", key: e.qid, stop: null } : stopped(what, "no-source");
    case "publish":
      if (owner === "done") return stopped(what, "done");
      if (e.year && e.year < thisYear) return stopped(what, "published");
      if (e.openLibrary) return { what, source: "openlibrary", key: e.openLibrary, stop: null };
      return e.qid ? { what, source: "wikidata", key: e.qid, stop: null } : stopped(what, "no-source");
    case "closure":
      if (owner === "done") return stopped(what, "done");
      if (e.closed) return stopped(what, "closed");
      return e.qid ? { what, source: "wikidata", key: e.qid, stop: null } : stopped(what, "no-source");
  }
}

export const DAY = 86_400_000;

/** How a check went: the facts found, `null` when the source doesn't know the id, or an error. */
export type CheckOutcome = { found: Omit<LiveStatus, "entityId"> } | { unknown: true } | { error: string };

/** When to look again (`next`, ms since epoch) or why to stop, and the running count of "unknown" answers. */
export interface WatchNext {
  next: number | null;
  stop: StopReason | null;
  misses: number;
}

/** Errors are retried soon; they never stop a watch. */
export const RETRY_AFTER_ERROR = 6 * 3_600_000;
/** "Unknown" answers in a row before giving up on an id. */
export const MAX_MISSES = 3;

const dayOf = (now: number) => new Date(now).toISOString().slice(0, 10);
/** Days from `now` to a YYYY-MM-DD / YYYY-MM / YYYY date (its first day). */
const daysUntil = (date: string, now: number) =>
  (Date.parse(date.length === 4 ? `${date}-01-01` : date.length === 7 ? `${date}-01` : date) - now) / DAY;

/** Whether a YYYY-MM-DD, YYYY-MM or YYYY date has fully passed by `now`. */
export function hasPassed(date: string, now: number): boolean {
  const today = dayOf(now);
  if (date.length === 10) return date <= today;
  if (date.length === 7) return date < today.slice(0, 7);
  return date < today.slice(0, 4);
}

/** The next step after a check. */
export function afterCheck(what: WatchWhat, outcome: CheckOutcome, misses: number, now = Date.now()): WatchNext {
  if ("error" in outcome) return { next: now + RETRY_AFTER_ERROR, stop: null, misses };
  if ("unknown" in outcome) {
    const m = misses + 1;
    return m >= MAX_MISSES
      ? { next: null, stop: "unknown-at-source", misses: m }
      : { next: now + 30 * DAY, stop: null, misses: m };
  }
  const f = outcome.found;
  const go = (days: number): WatchNext => ({ next: now + Math.round(days * DAY), stop: null, misses: 0 });
  const stop = (reason: StopReason): WatchNext => ({ next: null, stop: reason, misses: 0 });
  switch (what) {
    case "tv": {
      if (f.nextEpisode?.date) {
        // Look the day after it airs, but at least weekly (dates move) and at most daily.
        const until = daysUntil(f.nextEpisode.date, now) + 1;
        return go(Math.min(7, Math.max(1, until)));
      }
      if (f.status === "Running") return go(3);
      if (f.status === "Ended") {
        // Nothing new will air, but where it streams still changes.
        const last = f.lastEpisode?.date;
        return go(last && daysUntil(last, now) < -365 ? 60 : 30);
      }
      return go(7); // To Be Determined, In Development: news can come any week
    }
    case "movie": {
      const theatres = f.releases?.theatrical;
      if (f.inTheatres) return go(7); // streaming dates come soon after
      if (theatres && !hasPassed(theatres, now)) return go(daysUntil(theatres, now) <= 60 ? 7 : 30);
      if (!f.watchOn?.stream.length) return go(14); // out, but not streaming yet
      return go(30);
    }
    case "game": {
      const s = (f.devStatus ?? "").toLowerCase();
      if (s.includes("cancel")) return stop("cancelled");
      if (s === "released" || s === "full release") return go(90); // new platforms, remasters
      const d = f.releaseDate;
      return go(d && !hasPassed(d, now) && daysUntil(d, now) <= 60 ? 7 : 30);
    }
    case "release":
    case "publish": {
      const d = f.releaseDate;
      if (d && hasPassed(d, now)) return stop(what === "release" ? "released" : "published");
      if (d && daysUntil(d, now) <= 60) return go(7);
      return go(30);
    }
    case "closure":
      return f.closed ? stop("closed") : go(90);
    case "none":
      return stop("nothing-to-watch");
  }
}

/**
 * Most outside requests one check can take. TVmaze: 1 with its id known, else 2; plus 2 for
 * TMDB's where-to-watch (1 once the TMDB id is known). TMDB movie: find, movie, collection.
 * Wikidata and IGDB answer up to 50 per request.
 */
export function requestsFor(source: WatchSource, knownRef: boolean, keys: KeyedSources = NO_KEYS): number {
  if (source === "tvmaze") return (knownRef ? 1 : 2) + (keys.tmdb ? (knownRef ? 1 : 2) : 0);
  if (source === "tmdb") return knownRef ? 2 : 3;
  return 1;
}

/** Readable text for a stop reason (for the API summary and later the card). */
export const STOP_LABELS: Record<StopReason, string> = {
  removed: "Not on any open card",
  dropped: "Dropped",
  done: "Done",
  "not-linked": "No sure link",
  "no-source": "No free source knows it",
  "nothing-to-watch": "Nothing changes",
  released: "Released",
  published: "Published",
  ended: "Ended",
  cancelled: "Cancelled",
  closed: "Closed",
  "unknown-at-source": "Source doesn't know it",
};
