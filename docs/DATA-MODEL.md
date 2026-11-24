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

Titles, row text and linked things' names have no leading Markdown bullet: the import drops "* ", "- ", "+ " or
"• " (`stripBullet()`), and migration `0006_strip_bullets` cleaned the cards saved before that.

## Entity: a linked thing

A movie, show, book, game or place in the real world, with its standard ids: `imdb`, `openLibrary`,
`goodreads` (Goodreads work id) or `goodreadsBook` (edition id), `igdb`, `qid` (Wikidata), `wikipedia`, `lat`/`lng` or `mapQuery`, plus `label`, `year`, `author`.

`confidence` says how sure the link is:

| Value      | Meaning                                                 |
| ---------- | ------------------------------------------------------- |
| `high`     | Confirmed                                               |
| `user`     | Set by Sid by hand                                      |
| `review`   | A guess waiting for Sid (`candidate`, `alternatives`)   |
| `map`      | A place known by name and location: map link only       |
| `none`     | Nothing found                                           |
| `nolink`   | Not a real-world thing                                  |
| `rejected` | Sid said the guess was wrong and hasn't said what it is |

Sid's answers (the `reviews` table) are applied when a linked thing is read, by `applyReview()`
(`packages/core/src/review.ts`): `yes` takes the guess, `alt` another candidate, `no` drops the guess's links
(`rejected`), `none` means no link needed (`nolink`), `fix` sets his own links (`userLinks`, `user`, or added
alongside with `add`). The result carries `reviewed` with the answer. Deleting the answer brings the guess back.

## Other tables

- `reviews`: Sid's answers to guesses (`yes`, `no`, `none`, `alt` with another Wikidata id, `fix` with his own link, `hide`).
- `prefs`: settings by key (see below).
- `live`: TV status per linked show (status, seasons, last and next episode) and when to check again.
- `covers`: a cover image address per linked thing.
- `enrich_queue`: cards waiting to be linked (`mode` new or backfill, retries with back-off).
- `removed`: ids of cards deleted for good, so `GET /api/sync` can tell other devices to drop them.
- `works`, `relations`, `connect_state`: connections between things (see below).
- `lookup_state`: when an extra id was last looked up per linked thing and kind (`goodreads`), and when to try again.

## Connections

Series, sequels, adaptations and franchises come from Wikidata, for linked movies, shows, books and games with a
sure link (`high` or `user`). Connected things don't have to be in Orbit: the card shows the whole series ("3 of 6,
next: Children of Dune") and Sid adds the ones he wants (Sid, 2026-11-17: show on the card, add on tap; nothing is
added by itself).

- `works`: a real-world thing by Wikidata id (`qid`), as JSON (`Work` in `packages/core/src/connections.ts`):
  `label`, `type` (`movie`, `show`, `book`, `game`, `series`, `franchise`, `other`), `year`, `imdb`, `igdb`,
  `openLibrary`, `author`.
- `relations`: one connection, always stored one way: `series` (part of `to_qid`, at position `ord`), `follows`
  (comes after `to_qid`), `based_on` (made from `to_qid`), `franchise`. Read both ways for a card: what follows this,
  what was made from it.
- `connect_state`: when each linked thing was last connected and is next due (`connected`, `no-qid`, `failed`).
- Books linked to Open Library get their Wikidata id from Open Library's id (Wikidata `P648`); movies and shows from
  IMDb (`P345`). Only ids that match exactly one Wikidata item are kept, and nothing else about the linked thing
  changes. Cards are found by their linked thing's `qid` (indexed).

## Book links: Goodreads

Every book links to Goodreads (Sid, 2026-11-17). The link opens the book's page when an id is known: the Goodreads work id
from Wikidata (`P8383`, opens `/work/best_book/<id>`), else a Goodreads book id from Wikidata (`P2969`) or Open Library
(`id_goodreads`, lowest edition id). Otherwise it is a Goodreads search for the title and author. Rows marked `nolink`
get none. Ids are looked up by the connections job (100 books a run), and books with no id are tried again monthly.

## The sync list

`GET /api/sync` sends each card as a `SyncItem` (`packages/core/src/sync.ts`): the light fields, topics (`tags`),
details (`props`), checklist progress (`done`, `total`) and a few fields from the card's linked thing
(`category`, `confidence`, `lat`, `lng`, `cover`). The database reads these straight from each card's JSON,
so nothing has to be stored twice or back-filled. `toSyncItem()` builds the same row from a full card, for
updating the list after an edit.

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
| `kinds`      | Custom kinds in order: `[{ "name", "hue" }]`. Changed only through `/api/kinds` (`PUT /api/prefs/kinds` is refused); see "Kinds" below                                                                | `kinds`                                   |

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
| `kinds` (optional)  | Custom kinds in order: `[{ "name": "Zine", "hue": 40 }]`. Written by the web app; Orbit today has none                        |

`ui` and `here` were added on 2026-11-17 without a version change: files without them still load, with no
settings. When loading, Goal and Health cards become To-do cards, and `export-to-sql` writes the settings it
finds into `prefs` as `appearance`, `profile`, `location` and `kinds` (`--no-prefs` skips them). `kinds` was
added the same way: older files load with only the standard kinds.

## Kinds

Every card has a kind. The 13 standard kinds (`KINDS`, with hues in `KIND_HUES`) are built in and always come
first, in that order; they can't be renamed, recoloured, moved or deleted. Sid can add his own after them,
each with a name and a hue (0–360), in an order he chooses. They are kept as the `kinds` row of `prefs` and
read with `parseCustomKinds()` (`packages/core/src/kinds.ts`).

- `kindList(custom)` gives the full ordered list: `{ name, hue, order, standard }`.
- Names are compared by their slug (`kindSlug`), so "zine", "ZINE" and "Zine!" are one kind. A name must have a
  letter or number and at most 40 characters (`kindNameProblem`).
- Renaming a custom kind moves its cards (deleted ones too) to the new name. A custom kind can be deleted only
  when it has no cards (not counting deleted ones).
- `kindHue(kind, custom)`, `kindFromSlug(slug, list)` and `countByKind(items, list)` take the list so custom
  kinds get their colour, page and place in the order.

## Places on lists

Most places are checklist rows on list cards ("National parks"), not cards. `GET /api/places` lists every
card and row linked to a place with a spot, as a `PlaceRow` (`packages/core/src/places.ts`). The distance rules
are Orbit today's: exact coordinates first; otherwise a place on a city-based list (`CITY_CATEGORIES`) whose
location starts with a known city stands at that city's center (`approx`); head offices, studios and the like
(`NO_DISTANCE`) never count. `CITIES` is also the city list for setting a location.
