# Claude Code Instructions

## Project overview

**Orbit**: Sid's personal tracker (movies, shows, books, games, places, to-dos). Replaces Trello.

- **Stack**: TypeScript everywhere. npm workspaces.
  - `packages/core`: shared model and rules (no platform code; network access is passed in as `fetch`).
  - `apps/api`: Cloudflare Worker (Hono) + D1, cron enricher.
  - `apps/web`: web app (to come). Phone app later, reusing `packages/core`.
- **Free plans only.** Don't add paid services (Supabase, R2 needing a card, etc.) without asking.
- **This repository is public.** Never commit personal data: exports, seed SQL, `.dev.vars`, notes from Sid's cards.

## After any change

1. `npm run typecheck`
2. `npm test`
3. `npm run build` once apps have a build step
4. Update `TODO.md` (mark done with `[x]`) and `CHANGELOG.md` (under the current version; bug fixes under "Fixed").
5. Update `docs/` when the data model, API or setup changes.

## Rules for the data

- Each standard link comes from one source: IMDb (movies, shows; ids via Wikidata), Open Library (books), IGDB (games), a map link (places).
- Links that Sid confirmed or set himself (`confidence: "high"` or `"user"`) are never overwritten by the enricher.
- Back-filling old cards keeps only sure matches; unsure matches for new cards go to review.
- Never change Sid's saved data unless he asks.

## Git workflow (feature branch)

**NEVER push directly to main.** Always use a feature branch and a pull request.

```bash
git checkout -b type/short-description
git commit -m "type(scope): description"
git push -u origin type/short-description
gh pr create --title "type(scope): description" --body "What changed and why"
```

Branch and commit types: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`.

Notes for this environment: the GitHub GraphQL API may be unavailable, so use `gh api` (REST)
if `gh pr create` fails; if a push stalls, retry with `git -c push.negotiate=true push`.
