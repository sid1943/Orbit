# Orbit data model

Defined in `packages/core/src/types.ts`. The database keeps each record whole as JSON in a
`data` column, with a few copied columns for filtering and sorting (see `apps/api/migrations`).

## Item: one card

| Field                    | Meaning                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `id`                     | Kept from the old Orbit / Trello ids; new cards get `it_<uuid>`                                                    |
| `kind`                   | To-do, Experience, Place, Movie, Show, Book, Game, Podcast, Recipe, Learning, Thing, Money, Note                   |
| `title`, `notes`, `tags` | As written                                                                                                         |
| `status`                 | todo, doing, done, dropped                                                                                         |
| `source`                 | Where it came from, e.g. "Imported from Trello: Books › Want to Read"                                              |
| `props`                  | Free details: Quest, Genre, Watch on, Year, Author...                                                              |
| `due`, `start`           | Dates (YYYY-MM-DD)                                                                                                 |
| `archived`, `deleted`    | Hidden; deleted cards can still be brought back                                                                    |
| `entityId`               | The real-world thing this card is about                                                                            |
| `refs`                   | Other cards it points at                                                                                           |
| `links`                  | Useful links (`label`, `url`, optional `note`)                                                                     |
| `attachments`            | Files and links that came from Trello                                                                              |
| `comments`               | `date`, `text`                                                                                                     |
| `checklists`             | `name` and `rows`; each row has `text`, `done`, and optionally `ref` (another card) or `entityId` (a linked thing) |

## Entity: a linked thing

A movie, show, book, game or place in the real world, with its standard ids: `imdb`, `openLibrary`,
`igdb`, `qid` (Wikidata), `wikipedia`, `lat`/`lng` or `mapQuery`, plus `label`, `year`, `author`.

`confidence` says how sure the link is:

| Value    | Meaning                                               |
| -------- | ----------------------------------------------------- |
| `high`   | Confirmed                                             |
| `user`   | Set by Sid by hand                                    |
| `review` | A guess waiting for Sid (`candidate`, `alternatives`) |
| `map`    | A place known by name and location: map link only     |
| `none`   | Nothing found                                         |
| `nolink` | Not a real-world thing                                |

## Other tables

- `reviews`: Sid's answers to guesses (`yes`, `no`, `none`, `alt` with another Wikidata id, `fix` with his own link, `hide`).
- `prefs`: settings by key (see below).
- `live`: TV status per linked show (status, seasons, last and next episode) and when to check again.
- `covers`: a cover image address per linked thing.
- `enrich_queue`: cards waiting to be linked (`mode` new or backfill, retries with back-off).

## Settings (`prefs` table)

One row per key; `value` is JSON. Read with `parsePrefs()` (`packages/core/src/prefs.ts`), which falls back
to the default for anything missing or malformed, so a bad value never breaks the app. Saved with
`PUT /api/prefs/:key`.

| Key          | Value                                                                                                                                                                                                 | In the export                             |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `appearance` | `theme` (`system`, `light`, `dark`), `size` (1, 1.15, 1.3, 1.45), `font` (a `TEXT_FONTS` id), `heads` (a `HEADING_FONTS` id), `detail` (`mono` or `text`); lists in `packages/core/src/appearance.ts` | `ui` (`theme` `system` is written `auto`) |
| `profile`    | `name`: the name in the greeting                                                                                                                                                                      | `ui.name`                                 |
| `location`   | `label` (e.g. "Springfield, IL"), and `lat`, `lng` when known                                                                                                                                         | `here`                                    |
| `lists`      | `showArchived`: show archived cards in lists                                                                                                                                                          | not exported                              |

## The export file

"Download everything", in Orbit today and in the web app (Settings → Your data), writes
`orbit-export-YYYY-MM-DD.json`: format `orbit-export`, version 1. `packages/core/src/import-export.ts`
reads it (`importOrbitExport()`) and writes it (`exportOrbit()`).

| Field               | Holds                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `format`, `version` | `"orbit-export"`, `1`                                                                                                         |
| `exported`          | When, as an ISO date                                                                                                          |
| `items`             | Cards in short keys (`t` title, `k` kind, `s` status, `cl` checklists...)                                                     |
| `ent`               | Linked things by id                                                                                                           |
| `reviews`           | Review answers by linked-thing id                                                                                             |
| `ui` (optional)     | Orbit today's settings object: `size`, `font`, `heads`, `detail`, `theme` (`auto`, `light`, `dark`), `name`                   |
| `here` (optional)   | Location: `label`, `lat`, `lng`, and in Orbit today `src` and `at`; `null` when not set. A leading "near " is dropped on read |

`ui` and `here` were added on 2026-11-17 without a version change: files without them still load, with no
settings. When loading, Goal and Health cards become To-do cards, and `export-to-sql` writes the settings it
finds into `prefs` as `appearance`, `profile` and `location` (`--no-prefs` skips them).
