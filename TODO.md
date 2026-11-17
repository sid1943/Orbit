# Orbit TODO

## Step 1: Foundation

- [x] Monorepo (npm workspaces, TypeScript)
- [x] `packages/core`: data model, search rules, link building, export import
- [x] Enricher rules: Wikidata (IMDb, IGDB), Open Library, map links, links already in notes
- [x] TV status from TVmaze
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
- [ ] Decide how the hosted app signs in (API token in the browser, or Cloudflare Access)
- [x] Home: greeting, date, location, kind tiles
- [x] Home: search palette and the rest of Today (build step 2)
- [x] Everything, kind pages (status filter, grouping) and search results
- [ ] Card modal (links, notes, checklists with search, comments, due date)
- [ ] Map view with big topics, Near you
- [ ] Review queue
- [x] Settings (appearance, fonts, sizes, location, lists, data, guide, about) and the app map
- [x] Settings travel in the export (`ui`, `here`) and load into `prefs` (`appearance`, `profile`, `location`)
- [ ] Location panel: type a city, paste a map link, pick a city (build step 6)
- [ ] Covers on cards; TV status ("Season 3 out", "next episode Fri")
- [ ] Works offline for reading; installable on the phone home screen

## Step 3: After the web app matches the old Orbit

- [ ] Switch over; retire the claude.ai page
- [ ] Phone app (Expo) reusing `packages/core`
- [ ] Optional: TMDB (posters, release dates) and IGDB (game covers) with Sid's own free keys
