# Changelog

## 0.1.0 (2026-11-17)

Orbit replaces Smart Kanban in this repository.

### Added
- Monorepo with `packages/core` and `apps/api`.
- Core: data model, Orbit's search rule, standard links per kind, import of Orbit export files.
- Enricher: links new cards to IMDb (via Wikidata), Open Library, IGDB or a map; uses links already in a card's notes first; skips list cards; strict back-fill for old cards.
- TV status from TVmaze (status, seasons aired, last and next episode).
- API on Cloudflare Workers + D1 with token auth, and a job every 10 minutes.
- Loader that turns an export file into SQL for D1, splitting very large cards to fit D1's statement limit.
- Docs: architecture, data model, setup.

### Removed
- The old Smart Kanban React app.
