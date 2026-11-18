# How Orbit fits together

```
 web app (next)      phone app (later)
        \               /
         \             /
       Orbit API  (Cloudflare Worker, apps/api)
         |      \
         |       every 10 minutes, one budget of 48 subrequests:
         |          - links new cards (Wikidata -> IMDb / IGDB, Open Library, map)
         |          - live watch: TV status (TVmaze), release and closing dates (Wikidata),
         |            publication dates (Open Library), as each linked thing needs
         |          - dead-link check for links Sid pasted
         |
       D1 database (items, entities, reviews, prefs, live, covers, enrich_queue, works, relations, watch, link_checks)

 packages/core is shared by all of the above: the data model, search, link building,
 the import of Orbit export files, the enricher's matching rules, review answers and the sync list.

 Pages read one compact list of every card (GET /api/sync, refreshed with only what changed)
 and open a card in full (GET /api/items/:id/full) only when it is shown.
```

## Why these choices

- **TypeScript everywhere** so the web app, the phone app and the backend share one model and one set of rules.
- **Cloudflare free plan**: a Worker for the API and scheduled jobs, D1 (SQLite) for data. No server to run, no bill.
- **Covers are links**, not copies: Open Library, TVmaze and Wikimedia images load straight into the web app, so no file storage is needed.
- **The enricher never calls the network directly** in `packages/core`; the Worker passes `fetch` in. That keeps the rules testable with canned answers.

## The enricher

When a card is added (`POST /api/items`) it is queued (`apps/api/src/jobs/enrich-queue.ts`). Every 10 minutes the Worker takes
queued cards, up to about 5 per run (see "The cron budget" below).

Matching, per kind:

| Kind        | Source                                                                     | Sure ("high") when                                                     |
| ----------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Movie, Show | Wikidata search, then the IMDb id on the match                             | one exact title match of the right type (year decides between remakes) |
| Game        | Wikidata, IGDB id on the match                                             | same                                                                   |
| Book        | Open Library search                                                        | exact title, and the author matches if given                           |
| Place       | none                                                                       | always a map link built from the name and location                     |
| Any         | an IMDb / Open Library / IGDB address already in the card's notes or links | always (Sid put it there)                                              |

Cards that are lists of things (a "1001 Movies" card with a long checklist) get no link of their own.

Unsure matches are kept with `confidence: "review"` and their alternatives, for Sid to confirm.
Old cards from the import are back-filled in strict mode: only sure matches are kept, and cards without
a year (or books without an author) are skipped, because old lists hold many header cards.

## The cron budget

On the free Workers plan one run may make **50 subrequests, and outside requests and D1 calls count
together** (a `batch()` is one call), with 10 ms of CPU. All jobs share one `Budget` of 48
(`apps/api/src/jobs/shared.ts`), in this order:

1. What changed since the last run (1 call): linked things to re-plan, pasted links to add or drop.
2. New cards (enrich queue): at most 24, about 5 cards; Sid's new cards before the back-fill.
3. Live watch: plan up to 200 new or changed linked things (3 calls, no outside requests), then check
   what is due (1 call to read, 1 to save).
4. Connections (below), when 16 still fit besides the link check's share: 6 D1 calls counted up front,
   its Wikidata requests counted as they go.
5. Dead-link check: up to 12 links, never fewer than 4 requests' worth.

While the back-fill runs, live watch gets at least about 9 requests per run (1,300 a day); after it,
about 35 (5,000 a day). One Wikidata request answers 50 linked things.

## Live watch

The app decides for itself what each linked thing needs; there is nothing to set per card. The rule is
`watchRule()` in `packages/core/src/watch.ts`, the next step after each check is `afterCheck()`, and the
scheduler is `apps/api/src/jobs/live-watch.ts`.

| Linked thing (sure links only)                                               | Watches                                                                                           | Source                                    | How often                                                                                | Stops when                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------- |
| Show with an IMDb id                                                         | status, seasons, episodes, network; US where to watch (TMDB key)                                  | TVmaze, TMDB                              | day after the next episode (1–7 days); running 3 days; ended 30 days, 60 after a year    | dropped                             |
| Movie with an IMDb id (TMDB key)                                             | US theatres / digital / physical dates, in theatres, US stream / rent / buy, collection (sequels) | TMDB                                      | weekly in theatres or within 60 days of the date; 14 days until it streams; else monthly | watched, dropped                    |
| Game with an IGDB slug (IGDB keys)                                           | development status, release per platform, platforms                                               | IGDB (50 per request)                     | weekly within 60 days of the date; in development monthly; released every 90 days        | played, cancelled, dropped          |
| Movie or game from this year on, without keys                                | release date                                                                                      | Wikidata                                  | weekly within 60 days of the date, else monthly                                          | released, watched / played, dropped |
| Book from this year on                                                       | first publication date                                                                            | Open Library (Wikidata without a work id) | same                                                                                     | published, read, dropped            |
| Place that can close (eatery, museum, ballpark, building) with a Wikidata id | closing date                                                                                      | Wikidata                                  | every 90 days                                                                            | closed, visited, dropped            |
| Anything else, or no sure link                                               | nothing                                                                                           | —                                         | —                                                                                        | at once, with no request            |

- What points at a linked thing decides with it: the liveliest card or checklist row wins (open, then done,
  then dropped). Archived and deleted cards don't count; a thing nothing points at stops.
- Older movies, games and books (year before this one) stop at once: nothing to ask.
- A finished show keeps being watched (a new season matters, and where it streams changes); a dropped one stops.
- Keys are config (Worker secrets `TMDB_TOKEN`, `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET`; `.dev.vars` locally). TMDB
  checks are capped at 8 per run (its answers are big, and the free plan allows 10 ms of CPU). The Twitch token for
  IGDB is kept in `job_state` and renewed a day before it ends. TMDB ids and TVmaze ids are kept in `watch.ref`.
- TMDB posters fill in covers only where a linked thing has none. Streaming offers are JustWatch data and must be
  credited where shown.
- Books also get a Goodreads search link (title and author); Goodreads has no API any more.
- When a card, a row, a review answer or the linked thing changes, its rule is worked out again on the next run.
  If the source and id stay the same, it keeps its date, so editing a card doesn't trigger a check.
- Errors are retried in 6 hours; three "unknown id" answers stop the watch.
- Results go to the `live` table (and TVmaze covers to `covers`), which `GET /api/live` and the card read.

## Dead-link check

Links Sid pasted are checked: a card's Useful links and attachments, and addresses typed in "Fix links".
Standard links (IMDb, Open Library...) are built from ids and aren't checked. Rules in
`packages/core/src/link-check.ts`, job in `apps/api/src/jobs/link-check.ts`.

- HEAD first, GET when a site doesn't take HEAD; 10 seconds at most.
- Answers: `ok` (rechecked every 90 days); `blocked` (401, 403, 429: the site refuses robots, so Orbit
  can't tell; every 90 days); 404, 410, 5xx or no answer counts as gone.
- **Dead only after three gone answers a week apart**, then no longer checked. Until then it is `unsure`.
- A link taken off its card is forgotten, unless another card has it too.

## Connections

The cron also gathers connections from the Wikidata Query Service (free, no key; `jobs/connect-works.ts`):
missing Wikidata ids for books (from Open Library ids) and movies (from IMDb ids), then for 50 linked things per
run their series and its other members, sequels, what they're based on and what was made from them, and franchises,
plus the names and years of everything connected. Each is read again after 30 days. `npm run connect -w @orbit/api`
runs it all in one go against the local API. The card reads it with `GET /api/connections/:itemId`
(`useConnections()` in the web app).
