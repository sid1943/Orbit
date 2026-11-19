# Orbit TODO

## Step 1: Foundation

- [x] Monorepo (npm workspaces, TypeScript)
- [x] `packages/core`: data model, search rules, link building, export import
- [x] Enricher rules: Wikidata (IMDb, IGDB), Open Library, map links, links already in notes
- [x] TV status from TVmaze
- [x] Goodreads for every book: the book's page when Wikidata or Open Library has its Goodreads id, a search otherwise
- [ ] Second search for books and movies with no match (title and author on Wikidata) (Data chat)
- [x] Connections from Wikidata: series (with order), sequels, based on / adaptations, franchise; Wikidata ids for books from Open Library
- [x] `apps/api`: Worker + D1 schema, items / entities / reviews / prefs routes, token auth
- [x] Cron every 10 minutes: link new cards, back-fill old ones, refresh shows
- [x] Export file → SQL loader
- [x] Repository conventions: ESLint, Prettier, EditorConfig, CI, Dependabot, PR template, docs/CONVENTIONS.md
- [x] Sid: rename the GitHub repository to `orbit` (Settings → General)
- [ ] Sid: Cloudflare account, `wrangler d1 create`, secret, deploy (docs/SETUP.md)
- [ ] Sid: load the export

## Step 2: Web app (spec: docs/WEB-APP.md)

- [x] Vite + React app in `apps/web` with the layout (rail, top bar, search) and the API client; local token for now
- [x] Run in the background on Sid's Mac until it goes online (`scripts/mac-background.sh`)
- [x] The Mac picks up merged changes by itself (updater pulls `main` and restarts what changed)
- [x] API for the pages: one sync list for every page, a full card for the panel, review answers applied
- [x] API: places on lists (checklist rows linked to places) for Near you and Near me
- [x] API: custom kinds (add, rename, recolour, reorder, delete; in the export)
- [x] Today: a "+" tile to add a kind (Today chat)
- [ ] Settings: rename, recolour, reorder and delete custom kinds (Settings chat)
- [ ] Decide how the hosted app signs in (API token in the browser, or Cloudflare Access)
- [x] Home: greeting, date, location, kind tiles
- [x] Home: search palette and the rest of Today (build step 2)
- [x] Everything, kind pages (status filter, grouping) and search results
- [x] Home renamed Center Base; Map as the fourth side of its switch
- [x] Near me as the third side of Today's switch (left the menu)
- [x] All cards on Today (switch) with Filters: status, kind, topic, distance, when, archived, group, sort; Everything removed from the menu
- [x] Card panel (links, notes, checklists with search and row tools, comments, topics, due date, when, connections) and New item (build step 3)
- [ ] Card panel: "Linked from" (cards whose refs point here) needs refs in the sync list (API chat)
- [ ] Card panel: Fix links button (build step 5), cover and TV status (build step 8)
- [x] Map view with big topics (on Center Base's switch) and Topic pages; Near you
- [ ] Review queue
- [x] Settings (appearance, fonts, sizes, location, lists, data, guide, about) and the app map
- [x] Settings travel in the export (`ui`, `here`) and load into `prefs` (`appearance`, `profile`, `location`)
- [x] Location panel: use my location, type a city, paste a map link, pick a city (build step 6)
- [x] Near me: places by distance (5, 25, 100, 500 mi, Any), show done, category chips, city groups (build step 6)
- [ ] Card panel: show connections from `useConnections()` ("Part of Dune · 1 of 6 · next: Dune Messiah", tap to add) (Card chat)
- [ ] Watch connections for news (new book in a series, sequel announced) (Live chat, job LV)
- [ ] Covers on cards; TV status ("Season 3 out", "next episode Fri")
- [ ] Works offline for reading; installable on the phone home screen

## Step 3: After the web app matches the old Orbit

- [ ] Switch over; retire the claude.ai page
- [ ] Phone app (Expo) reusing `packages/core`
- [ ] Optional: TMDB (posters, release dates) and IGDB (game covers) with Sid's own free keys
