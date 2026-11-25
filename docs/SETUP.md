# Putting Orbit online (Cloudflare free plan)

You do these steps yourself: they sign in to your Cloudflare account and set your password.
Nothing here costs money. Run the commands from the repository folder after `npm install`.

## 1. Sign in to Cloudflare

Make a free account at cloudflare.com if you don't have one, then:

```bash
cd apps/api
npx wrangler login
```

## 2. Make the database

```bash
npx wrangler d1 create orbit
```

It prints a `database_id`. Paste it into `apps/api/wrangler.toml` in place of `REPLACE_WITH_YOUR_D1_ID`.
Then create the tables:

```bash
npx wrangler d1 migrations apply orbit --remote
```

## 3. Choose the API password

The API only answers requests that carry this password (a long random one is best; a password
manager can make one). It's stored by Cloudflare, never in this repository.

```bash
npx wrangler secret put API_TOKEN
```

### Keys for movies, shows and games (optional)

Live watch uses two free services that need your own keys. They are config, stored by Cloudflare as
secrets, never in this repository. Without them, movies and games fall back to Wikidata release dates.

- **TMDB** (movies: US theatres, streaming, sequels; shows: where to watch): your TMDB account →
  Settings → API → "API Read Access Token" (the long one, not the short API key).
- **IGDB** (games: development status, dates, platforms): a Twitch developer app
  (dev.twitch.tv → Your Console → Applications → Register, category "Application Integration"),
  then its **Client ID** and a **Client Secret** ("New Secret").

```bash
npx wrangler secret put TMDB_TOKEN
npx wrangler secret put IGDB_CLIENT_ID
npx wrangler secret put IGDB_CLIENT_SECRET
```

Streaming offers come from JustWatch through TMDB: wherever the app shows them it must say
"Streaming data from JustWatch" and credit TMDB.

## 4. Put the API online

```bash
npx wrangler deploy
```

It prints your address, like `https://orbit-api.<your-name>.workers.dev`. Check it:

```bash
curl https://orbit-api.<your-name>.workers.dev/api/health
```

## 5. Load your Orbit data

1. In the current Orbit page: **Settings → Your data → Download everything**. You get `orbit-export-YYYY-MM-DD.json`.
2. Make the SQL and load it (keep both files outside the repository, or in `apps/api/data/`, which git ignores):

```bash
npm run import:sql -w @orbit/api -- ~/Downloads/orbit-export-YYYY-MM-DD.json data/seed.sql
npx wrangler d1 execute orbit --remote --file data/seed.sql
```

Loading again later is safe: rows are replaced, not duplicated. The free plan allows 100,000 row
writes a day, and one full load uses roughly half of that, so load at most once a day.

The load also queues your unlinked cards (movies, shows and games with a year, books with an author)
so the enricher links them over the next day or two. Add `--no-enqueue` to skip that.

Settings in the file (appearance, the greeting name and your location) are loaded too, into the `prefs`
table. Files from before settings were added to the export simply have none. Add `--no-prefs` to keep
the settings already in the database, for example after changing them in the web app.

After loading the same export again, have every linked thing's watch worked out afresh (the load keeps
old change times, so the cron wouldn't notice):

```bash
npx wrangler d1 execute orbit --remote --command "DELETE FROM job_state"
```

3. Check the counts:

```bash
npx wrangler d1 execute orbit --remote --command "SELECT kind, COUNT(*) FROM items WHERE deleted = 0 GROUP BY kind"
```

## Trying it on your computer instead

```bash
cd apps/api
echo "API_TOKEN=local-password" > .dev.vars
# optional keys, one per line in the same file: TMDB_TOKEN=…, IGDB_CLIENT_ID=…, IGDB_CLIENT_SECRET=…
npx wrangler d1 migrations apply orbit --local
npx wrangler d1 execute orbit --local --file data/seed.sql
npx wrangler dev --test-scheduled
# run the enricher by hand:
curl -X POST -H "Authorization: Bearer local-password" http://localhost:8787/api/enrich/run
# gather series, sequels and adaptations for everything at once (instead of 50 per cron run):
npm run connect
```

### The web app on your computer

With the API running as above, in a second terminal:

```bash
cp apps/web/.env.example apps/web/.env.local   # VITE_API_TOKEN=local-password
npm run dev -w @orbit/web
```

Open http://localhost:5173. Vite forwards `/api` to the API on port 8787. If the page says the API isn't running
or refused the token, it tells you which of the two to fix. To load your real data locally, run the
`import:sql` step from section 5 and then `npx wrangler d1 execute orbit --local --file data/seed.sql`.

### Keep it running on a Mac

To keep the API and the web app running after Terminal closes, starting again at login, and to run the
10-minute update job (linking new cards, TV status) that local mode doesn't run by itself:

```bash
scripts/mac-background.sh install     # stop any servers running in Terminal first
scripts/mac-background.sh status
scripts/mac-background.sh logs        # Ctrl+C to stop following
scripts/mac-background.sh uninstall   # stop and remove; your local data is kept
```

It adds four LaunchAgents (`com.orbit.api`, `com.orbit.web`, `com.orbit.updater`, `com.orbit.sync`) to `~/Library/LaunchAgents`,
with logs in `~/Library/Logs/orbit`. They pause while the Mac sleeps. If you change Node versions, run
`scripts/mac-background.sh restart`.

The sync agent keeps the code current. Every 15 seconds it asks GitHub whether `main` moved (`git ls-remote`, a
few hundred bytes, nothing downloaded otherwise). When it has, it pulls the new commits, runs `npm install` and the
local database migrations if those changed, and restarts the API if its code changed. The web app reloads by
itself, so a merged pull request shows up in the open page within about 15 seconds, with nothing to type. It only
does this when your copy is on `main` with no uncommitted edits and no commits of its own; otherwise it leaves the
copy alone and says why, once, in `~/Library/Logs/orbit/sync.log`. Run it by hand with
`scripts/mac-background.sh sync`.

The 10-minute updater runs the API's scheduled job and also pulls, as a fallback. On a Mac set up before the sync
agent existed, the updater installs the sync agent by itself on its next run.

How the hosted web app signs in (the API token, or Cloudflare Access) is decided before it goes online.

## The API

All routes except `/api/health` need `Authorization: Bearer <API_TOKEN>`.

| Route                                                        | What it does                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `GET /api/health`                                            | Is it up                                                                  |
| `GET /api/sync?since=&after=&limit=`                         | Every card in light form (see below)                                      |
| `GET /api/items?kind=&status=&since=&limit=&offset=&full=1`  | List cards (light fields unless `full=1`)                                 |
| `GET /api/items/:id`                                         | One card, complete                                                        |
| `GET /api/items/:id/full`                                    | One card with its linked things, TV status, covers and review answers     |
| `GET /api/places?since=`                                     | Every card and checklist row linked to a place (Near you, Near me)        |
| `GET /api/kinds`, `POST /api/kinds`                          | Every kind in order with its card count; add a custom kind                |
| `PATCH` / `DELETE /api/kinds/:name`, `PUT /api/kinds/order`  | Rename or recolour, delete (only with no cards), reorder custom kinds     |
| `POST /api/items`                                            | Add a card (`kind`, `title` required); it is queued for linking           |
| `PATCH /api/items/:id`                                       | Change fields                                                             |
| `DELETE /api/items/:id`                                      | Move to deleted (`?hard=1` removes it for good)                           |
| `GET /api/entities?ids=a,b` / `?confidence=review`           | Linked things, answers applied (`&pending=1`: unanswered only)            |
| `GET /api/entities/:id`                                      | One linked thing with its TV status and cover                             |
| `PATCH /api/entities/:id`                                    | Fix a link by hand (marked as set by you; the enricher leaves it alone)   |
| `GET /api/live?ids=a,b`                                      | Live facts (TV status, release / closing dates) and covers                |
| `GET /api/watch`                                             | Live watch and link check at a glance: watched, stopped (why), due        |
| `GET /api/watch/links?item=<id>` / `?state=dead`             | A card's pasted links with their state; or every link in one state        |
| `GET /api/reviews`, `PUT` / `DELETE /api/reviews/:key`       | Your answers to link guesses; `DELETE` undoes one                         |
| `GET /api/prefs`, `PUT /api/prefs/:key`                      | Settings by key: `appearance`, `profile`, `location`, `lists`             |
| `POST /api/enrich/run`                                       | Run the 10-minute jobs now (linking, live watch, link check, connections) |
| `GET /api/connections/:itemId`                               | A card's series, sequels, source and adaptations, franchise (or null)     |
| `GET /api/connections/progress`, `POST /api/connections/run` | How far gathering connections has got; gather one batch now               |

Notes:

- **Sync** (`GET /api/sync`) is what the pages work from. It returns `{ items, removed, at, next }`: every card
  (deleted ones flagged `deleted`) with its topics, details, due and start dates, checklist progress
  (`done`, `total`) and, from its linked thing, `category`, `confidence`, `lat`, `lng` and `cover`. Pages are
  ordered by id; pass `next` as `after` for the next one. Pass the first page's `at` as `since` next time to get
  only what changed, plus `removed`: cards deleted for good. Changes up to 5 seconds before `since` are sent again,
  so nothing written during a sync is missed. The shape is `SyncItem` in `packages/core/src/sync.ts`.
- **Places** (`GET /api/places`) returns `{ places, items, at }`: every card and checklist row linked to a place
  that has a spot (its own coordinates, or a city-based list place whose location starts with a known city).
  Each `PlaceRow` has the card id, checklist and row index (null for the card itself), the row's text, whether
  it's ticked, and the place's category, confidence, `lat`, `lng` and `location`, with review answers applied.
  With `since`, only the places of cards that changed are sent, and `items` lists those cards so the app
  replaces their places. Sort with `placesByDistance()` from core.
- **Lists of ids** (`?ids=`) take up to 2000 ids. More is refused with 400, never cut short.
- **Review answers** stay apart from the guesses so they can be undone. Every route that returns a linked thing
  applies them (`applyReview` in `packages/core/src/review.ts`, the same rule as Orbit today). Keys are an entity
  id, `card-<itemId>`, or `x:<key>` for links Sid hid (`{ "d": "hide", "urls": [...] }`).
- **Kinds** (`/api/kinds`): `GET` returns `{ kinds }`, each `{ name, hue, order, standard, count }`, the
  13 standard kinds first and then Sid's own, even with no cards. `POST { name, hue? }` adds one after the others
  (a hue far from the others when none is given) and answers `{ kind, kinds }` with 201; an empty name, or a
  name taken in any capitalization, is refused with 400. `PATCH /api/kinds/:name { name?, hue? }` renames
  (moving the cards; `moved` says how many) or recolours; `PUT /api/kinds/order { names }` takes every custom
  kind once; `DELETE /api/kinds/:name` answers 409 with `count` when the kind has cards. Standard kinds can't
  be changed (400).
- **Settings** keys other than `appearance`, `profile`, `location` and `lists` are refused (custom kinds go
  through `/api/kinds`).
