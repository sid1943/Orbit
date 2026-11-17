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
