# Conventions

## Code

- **TypeScript, strict.** `tsconfig.base.json` turns on `strict` and `noUncheckedIndexedAccess`; every workspace extends it.
- **ES modules.** Import local files with the `.js` extension (`./text.js`), as TypeScript's module resolution expects.
- **Formatting is Prettier's job** (`npm run format`); **ESLint** catches the rest (`npm run lint`). Don't hand-format.
- **Type-only imports** use `import type` or inline `type` (enforced by ESLint).
- **Named exports** everywhere. The only default export is the Worker entry (`apps/api/src/index.ts`), which Cloudflare requires.
- **Unused values** are an error; prefix with `_` when a parameter must exist but isn't used.
- **No platform code in `packages/core`.** It never calls `fetch`, D1 or the DOM directly; callers pass those in. That keeps it shared by the API, web and phone apps, and testable offline.
- **Comments say why**, not what. Public functions get a one-line `/** ... */`.

## Files and folders

- File names are **kebab-case** (`import-export.ts`, `enrich-queue.ts`).
- Tests live in each workspace's `test/` folder, one file per module: `src/text.ts` → `test/text.test.ts`.
- Shared test helpers go in `test/helpers/`.
- In `apps/api/src`: `routes/` (one router per resource), `middleware/`, `jobs/` (cron work), `db/` (SQL), `lib/` (pure helpers such as validation), `app.ts` (wiring) and `index.ts` (Worker entry).
- New database changes are new numbered files in `apps/api/migrations/` (`0002_add_x.sql`). Never edit a migration that has been applied online.

## Tests

- Vitest, with `describe` / `it` / `expect`.
- No network in tests: pass `cannedFetch` or `noFetch` from `test/helpers/fetch.ts`.
- Every bug fix gets a test that fails without it.

## Git

- **Never push to `main`.** Work on a branch and open a pull request; CI must pass.
- Branches: `type/short-description`, for example `feat/web-home` or `fix/import-due-dates`.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): description`.
  - Types: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`, `ci`.
  - Scopes: `core`, `api`, `web`, `docs`, `repo`.
- Update `CHANGELOG.md` under **Unreleased** and tick items in `TODO.md` in the same pull request.

## Data and privacy

- The repository is public. Never commit exports, generated SQL, `.dev.vars`, or text from personal cards (test fixtures use made-up examples).
- Secrets are set with `wrangler secret put`, never written in files.
