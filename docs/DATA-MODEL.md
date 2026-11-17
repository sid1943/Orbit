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
- `prefs`: settings by key.
- `live`: TV status per linked show (status, seasons, last and next episode) and when to check again.
- `covers`: a cover image address per linked thing.
- `enrich_queue`: cards waiting to be linked (`mode` new or backfill, retries with back-off).

## Import from the first Orbit

`importOrbitExport()` in `packages/core/src/importExport.ts` reads the "Download everything" file
(format `orbit-export`, version 1). Goal and Health cards become To-do cards.
