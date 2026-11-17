# Orbit

One place for everything Sid wants to watch, read, play, visit and do.
Orbit replaced Trello: movies, shows, books, games, places, to-dos and notes live here,
and each one links to its standard page (IMDb, Open Library, IGDB, a map).

This repository is the app version of Orbit. It is being built in steps; the first Orbit
(a single page on claude.ai) stays in use until this app does everything it does.

## What's here

| Folder | What it is |
| --- | --- |
| `packages/core` | Shared TypeScript: the data model, search rules, link building, the import of Orbit export files, and the enricher (finds the IMDb / Open Library / IGDB link for a new card, and TV status from TVmaze). Used by the API now and the web and phone apps later. |
| `apps/api` | The backend: a Cloudflare Worker with a D1 database. A small JSON API, plus a job every 10 minutes that links newly added cards and refreshes TV shows. |
| `apps/web` | The web app (next step). |
| `docs/` | How it fits together, the data model, and setup steps. |

## Quick start (on your computer)

```bash
npm install
npm test              # core rules
npm run typecheck

cd apps/api
echo "API_TOKEN=pick-any-local-password" > .dev.vars
npx wrangler d1 migrations apply orbit --local
npx wrangler dev      # http://localhost:8787/api/health
```

Putting it online on Cloudflare (free plan) and loading your data: see [docs/SETUP.md](docs/SETUP.md).

## Your data stays out of this repository

This repository is public. Personal data (the export file, the SQL made from it, `.dev.vars`)
is listed in `.gitignore` and must never be committed.

## Costs

Everything runs on free plans: Cloudflare Workers and D1 free tiers, and free public sources
(Wikidata, Open Library, TVmaze). No keys are needed for those. IGDB and TMDB need free
keys and are optional.
