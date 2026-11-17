# Changelog

All notable changes to Orbit are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Monorepo with npm workspaces: `packages/core` and `apps/api`.
- Core: data model, search rule, standard links per kind, import of Orbit export files.
- Linking: IMDb via Wikidata, Open Library, IGDB and map links; links already in a card's notes are used first; list cards are skipped; strict back-fill for old cards.
- Live TV status from TVmaze (status, seasons aired, last and next episode).
- API on Cloudflare Workers and D1 with token auth, split into routes, middleware, jobs and validation.
- Cron every 10 minutes for linking and TV status.
- Loader from an export file to D1 SQL, splitting very large cards to fit D1's statement limit.
- Tooling: ESLint, Prettier, EditorConfig, Vitest in each workspace, GitHub Actions CI, Dependabot, PR template.
- Docs: architecture, data model, setup, conventions, web app plan.
- Web app (`apps/web`, build step 1): Vite, React, React Router and TanStack Query; the layout from Orbit today
  (rail, greeting with date and location, search bar, Back to Today); kind tiles with counts on Today; a typed API
  client that follows pages and explains when the API is down or refuses the token; placeholder pages for later steps.
- `scripts/mac-background.sh`: runs the API, the web app and the 10-minute update job in the background on a Mac
  (LaunchAgents), surviving closed Terminals and restarting at login.
- Core: shared settings (`parsePrefs`), the greeting rule and each kind's colour.
- Web app (build step 4): Settings in the Mac layout (Appearance, Profile, Location, Lists, Your data, Guide,
  About with the app map). Theme, text size, heading font, detail lines and 18 text fonts apply at once and are
  remembered in the browser for the first paint. "Download everything" writes an `orbit-export` file from the app.
- Core: appearance options and validation (`appearance.ts`); prefs keys `appearance` and `lists`;
  `exportOrbit()` writes the export file, and `importOrbitExport()` reads its optional `ui` and `here` settings.
- Loader: `export-to-sql` writes the export's settings into `prefs` (`appearance`, `profile`, `location`);
  `--no-prefs` skips them.
- API: `GET /api/entities` pages through every linked thing (`limit`, `offset`, `next`).
- `scripts/mac-background.sh`: the 10-minute updater also pulls new commits on `main` (fast-forward only, never
  over local edits), runs `npm install` and migrations when needed, and restarts the API when its code changed.
- API: `GET /api/sync`, every card in light form (topics, details, checklist progress, coordinates and cover of
  its linked thing), in pages, with `since` for only what changed and `removed` for cards deleted for good.
  Migration `0002_sync.sql` adds the `removed` table and indexes; existing cards need no back-fill.
- API: `GET /api/items/:id/full`, a card with every linked thing on its checklists, TV status, covers and review
  answers, however long its lists.
- API: `DELETE /api/reviews/:key` undoes an answer; `GET /api/entities?confidence=review&pending=1` lists only
  unanswered guesses.
- Core: `applyReview()` (Orbit today's rule for review answers), `SyncItem`, `toSyncItem()`, `mergeSync()`,
  `upsertSyncItem()`, `FullItem`; confidence `rejected`.
- Web: `useSync()`, `useFullItem()` and `useReview()`; the card counts now come from the sync list.
- API tests run the real SQL and migrations on Node's built-in SQLite (`apps/api/test/helpers/d1.ts`).
- API: `GET /api/places`, every card and checklist row linked to a place (card, row, text, ticked, spot), with
  `since` for only the cards that changed. Near you and Near me can now find places on lists, as Orbit today did.
- Core: `places.ts` with Orbit today's distance rules (`placeSpot`, city centers for city lists, `placesByDistance`,
  `placeLabel`, `mergePlaces`) and its `CITIES` list. Web: `usePlaces()`.
- Custom kinds: `/api/kinds` lists every kind in order (standard ones first, then Sid's own, each with hue, order
  and card count, even at 0), adds one (empty or taken names refused in any capitalization), renames (moving its
  cards), recolours, reorders, and deletes one with no cards (otherwise 409 with the count). Stored as the `kinds`
  prefs row; carried in the export file and loaded by `export-to-sql`; older files still load.
- Core `kinds.ts`: `kindList()`, `parseCustomKinds()`, `kindNameProblem()`, `findKind()`, `suggestHue()`,
  `reorderKinds()`; `countByKind()`, `kindSlug()` and `kindFromSlug()` moved here from the web app and take the
  kind list; `kindHue()` takes the custom kinds. Web: `useKinds()`, `useAddKind()`, client calls for the rest;
  `/kind/:kind` opens custom kinds; "Download everything" includes them.
- Web app (build step 2): Today with every section from Orbit today (kind tiles, Near you, Coming up, In season
  now, In progress, To-do with add and tick off grouped by quest, Closest to finished, Pick one today, Recently
  changed, Topics); Everything and kind pages with status filter and grouping kept in the address; search results
  ranked title-first; the search palette on the search bar (arrows, Enter, "Search everything for …").
- Core: Today rules (`today.ts`): dates from "Preferable Time" (`timeInfo`, `nextDate`, `monthsOf`, `inSeason`),
  list order, daily picks, closest to finished, topic counts, distances in miles, `parseTodo`, `nextStatus`.
- Web API client: `createItem` and `updateItem`, with `useCreateItem` / `useUpdateItem` updating the sync list at once.
- "+" square tile after the kind tiles (Today and Everything) adds a kind: a dialog with a name (checked as you type:
  empty or taken names are refused) and a colour slider starting far from the other kinds. Kind tiles follow
  `useKinds()`, so a new kind shows at once with 0 cards; kind chips and groups use custom kinds' colours.
- Kind tiles (Today, Everything, kind pages) are square, keep one size that follows the text-size setting, and wrap
  onto more rows as kinds are added; three across on phones.
- Today's Near you uses the places on your lists (`usePlaces()`, `placesByDistance()`): checklist rows as well as
  cards, "on <list>" under each row, "+ N things to do in <city>" for city-list places with no exact spot, and the
  closest place when nothing is within 100 miles. Shared `NearbyRow` and `lib/near-you.ts` for Near me.
- Web app (build step 3): the card panel at `/item/:id`, a big centered card filled from `useFullItem()`. Header with
  kind, title, status, Archive and Delete; main column with Useful links (standard link first, then the card's links
  and attachments, all with readable names, hidden links left out), Notes (readable links, `[[Exact title]]` opens the
  card, edit in place), Checklists (search across rows and their linked things, progress, tick, add, edit, move up and
  down or to another checklist, delete, rename or delete a checklist, first 40 rows then Show all) and Comments; side
  column with topics, due date, details, When (months and season) and connected cards. One column on phones.
- Web app: a card opens over the page you were on, as in Orbit today: `/item/:id` stays its address (links,
  reloads and Back work), the page behind keeps its place, and the card closes with ×, Escape or a click on the
  backdrop, back to that page. Opened straight from its address, the card sits over Today. The page behind can't be
  tabbed into while the card is open. On phones the card fills the screen.
- Web app: New item (the New button or N) with title and #topics, kind and status; it opens the new card.
- Core: `card.ts` with the card panel's rules (`usefulLinks`, `thingLinks`, `hiddenFor`, `textParts`, `splitTopics`,
  checklist, comment and topic edits, `checklistMatches`, `linkedCardIds`, `relatedByTopics`).
- Web API client: `updateItem` takes every editable field, `deleteItem`; hooks `useEditCard()` (the card and lists
  change at once, and go back if saving fails) and `useDeleteItem()`.

### Fixed

- `useAddKind()` refused every new name ("there is already a kind called …"): it checked the name after
  adding it to the list. It now checks first, then shows the new kind.

- API: review answers are applied wherever a linked thing is returned; before, they were stored but a confirmed or
  corrected guess still showed as a guess.
- API: TV status checks follow review answers (a confirmed guess is checked, a rejected one isn't).
- API: `?ids=` lists were cut to 90 without saying so; now up to 2000 go as one parameter, and more is refused.
- API: fixing a linked thing by hand and saving settings check what is sent.
