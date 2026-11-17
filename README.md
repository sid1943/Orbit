# Orbit

[![CI](https://github.com/sid1943/orbit/actions/workflows/ci.yml/badge.svg)](https://github.com/sid1943/orbit/actions/workflows/ci.yml)

One place for everything to watch, read, play, visit and do.

Orbit keeps movies, shows, books, games, places, to-dos and notes as cards. Each card links to its
standard page (IMDb, Open Library, IGDB or a map), new cards are linked automatically, and TV shows
carry live status: seasons aired, the last episode, and the next one.

## Features

- **Cards for everything**: one model for movies, shows, books, games, places, to-dos, recipes, notes and more.
- **Standard links**: IMDb for movies and shows (ids from Wikidata), Open Library for books, IGDB for games, a map for places.
- **Automatic linking**: new cards are matched every 10 minutes. Sure matches are kept; unsure ones wait for review.
- **Live TV status** from TVmaze, and cover images from Open Library, TVmaze and Wikimedia.
- **Free to run**: Cloudflare Workers and D1 free plans, and free public data sources with no keys.

## Repository layout

```
orbit/
├── apps/
│   ├── api/                  Cloudflare Worker + D1 (Hono)
│   │   ├── migrations/       Database schema
│   │   ├── scripts/          Export file → SQL loader
│   │   ├── src/
│   │   │   ├── app.ts        Routes and middleware
│   │   │   ├── index.ts      Worker entry (fetch + cron)
│   │   │   ├── db/           SQL statements and row mapping
│   │   │   ├── jobs/         Linking queue and TV status refresh
│   │   │   ├── lib/          Request validation
│   │   │   ├── middleware/   Token auth
│   │   │   └── routes/       items, entities, live, reviews, prefs, enrich
│   │   └── test/
│   └── web/                  Web app (Vite + React)
│       ├── src/
│       │   ├── api/          API client and data hooks
│       │   ├── components/   Layout: rail, top bar, search
│       │   ├── pages/        One file per page
│       │   ├── lib/          Small helpers (kinds, dates, config)
│       │   ├── styles/       Design tokens and CSS
│       │   └── routes.tsx    Every page in one list
│       └── test/
├── packages/
│   └── core/                 Shared model and rules, no platform code
│       ├── src/              types, text, links, enrich, live, import-export
│       └── test/
├── docs/                     Architecture, data model, setup, conventions
└── .github/                  CI, Dependabot, PR template
```

## Getting started

Requires Node 22 (see `.nvmrc`).

```bash
npm install
npm run check          # format, lint, typecheck, tests
```

Run the API locally:

```bash
cd apps/api
echo "API_TOKEN=pick-a-local-password" > .dev.vars
npm run db:migrate:local
npm run dev            # http://localhost:8787/api/health
```

Run the web app next to it (in a second terminal):

```bash
cp apps/web/.env.example apps/web/.env.local   # set VITE_API_TOKEN to the same password
npm run dev -w @orbit/web                      # http://localhost:5173
```

The web app's `/api` calls are forwarded to the local API, so both run on your computer with no Cloudflare account.

To put it online on Cloudflare and load your data, follow [docs/SETUP.md](docs/SETUP.md).

## Scripts

| Command                     | What it does                                       |
| --------------------------- | -------------------------------------------------- |
| `npm run check`             | Everything CI runs: format, lint, typecheck, tests |
| `npm test`                  | Unit tests (Vitest) in every workspace             |
| `npm run typecheck`         | TypeScript, no output                              |
| `npm run lint`              | ESLint (`lint:fix` to fix)                         |
| `npm run format`            | Prettier, writes changes (`format:check` to check) |
| `npm run dev -w @orbit/api` | API on localhost with a local database             |
| `npm run dev -w @orbit/web` | Web app on localhost, talking to the local API     |
| `npm run build`             | Builds the web app into `apps/web/dist`            |

## Documentation

- [Architecture](docs/ARCHITECTURE.md): how the pieces fit, the linking rules, TV status
- [Data model](docs/DATA-MODEL.md): cards, linked things, confidence, tables
- [Setup](docs/SETUP.md): Cloudflare deploy, loading data, API reference
- [Conventions](docs/CONVENTIONS.md): code style, structure, commits and branches
- [Web app plan](docs/WEB-APP.md): every page, panel and setting the web app needs, and the build order

## Privacy

This repository is public; personal data never goes in it. Exports, generated SQL and `.dev.vars`
are ignored by git.
