# How Orbit fits together

```
 web app (next)      phone app (later)
        \               /
         \             /
       Orbit API  (Cloudflare Worker, apps/api)
         |      \
         |       every 10 minutes: enricher
         |          - links new cards (Wikidata -> IMDb / IGDB, Open Library, map)
         |          - refreshes TV status (TVmaze)
         |
       D1 database (items, entities, reviews, prefs, live, covers, enrich_queue, works, relations)

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

When a card is added (`POST /api/items`) it is queued (`apps/api/src/jobs/enrich-queue.ts`). Every 10 minutes the Worker takes up to 8
queued cards and 4 TV shows (the free plan allows 50 outside requests per run).

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

## TV status

For shows with a confirmed IMDb id, TVmaze gives status (Running, Ended...), the number of seasons
aired, and the last and next episode. Shows with an episode coming are checked daily, running shows
every 3 days, ended shows monthly.

## Connections

The cron also gathers connections from the Wikidata Query Service (free, no key; `jobs/connect-works.ts`):
missing Wikidata ids for books (from Open Library ids) and movies (from IMDb ids), Goodreads ids for 100 books (from
Wikidata, then Open Library), then for 50 linked things per
run their series and its other members, sequels, what they're based on and what was made from them, and franchises,
plus the names and years of everything connected. Each is read again after 30 days; missing ids are tried again monthly.

The second look (`jobs/rematch.ts`, on request only) takes unmatched books and movies (`none`, not answered in review)
and reads each row as possible title / author pairs (core `titleGuesses()`), then searches Open Library (books, all
fields, without a leading article) or Wikidata (movies, the enricher's sure rule). A book counts only when the title
(ignoring case, punctuation and a leading article, or the part before a colon) and the author's surname agree; with no
author, only a clear first result with 3+ editions and no rival of similar size. Linked books with no Wikidata id are
searched on Wikidata by title and author (40 per query, editions left out, one clear work only). Matched rows become
sure links and flow into the connections job. Not found: looked at again after 90 days. `npm run connect -w @orbit/api`
runs it all in one go against the local API. The card reads it with `GET /api/connections/:itemId`
(`useConnections()` in the web app).
