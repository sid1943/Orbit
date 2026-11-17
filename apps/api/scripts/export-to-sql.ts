/**
 * Turns an Orbit export file ("Download everything" in the old Orbit page) into SQL
 * that loads it into D1:
 *
 *   npm run import:sql -w @orbit/api -- path/to/orbit-export.json data/seed.sql
 *   npx wrangler d1 execute orbit --remote --file data/seed.sql      (from apps/api)
 *
 * Unlinked movies, shows and games with a year, and books with an author, are queued for the
 * enricher in back-fill mode, which keeps only sure links (pass --no-enqueue to skip that).
 *
 * Settings in the file go into the `prefs` table under `appearance`, `profile` and `location`
 * (docs/DATA-MODEL.md). Only keys the file has are written; pass --no-prefs to keep the database's settings.
 *
 * The output holds personal data: keep it out of git (data/ and seed*.sql are ignored).
 * Running it again is safe: rows are replaced, not duplicated.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { backfillable, importOrbitExport } from "@orbit/core";
import { entityRow, itemRow, reviewRow } from "../src/db/statements.js";

const args = process.argv.slice(2);
const noEnqueue = args.includes("--no-enqueue");
const noPrefs = args.includes("--no-prefs");
const [input, output = "data/seed.sql"] = args.filter((a) => !a.startsWith("--"));
if (!input) {
  console.error("Usage: export-to-sql <orbit-export.json> [out.sql]");
  process.exit(1);
}

const lit = (v: unknown): string =>
  v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
/** D1 allows 100 KB per statement, so a very big record (a long checklist) goes in as several appends. */
const MAX = 90_000;
function insert(table: string, cols: string[], rows: unknown[][]): string[] {
  const out: string[] = [];
  const key = cols[0]!;
  const dataAt = cols.indexOf("data");
  for (const r of rows) {
    const sql = `INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${r.map(lit).join(", ")});`;
    if (Buffer.byteLength(sql) <= MAX || dataAt < 0) {
      out.push(sql);
      continue;
    }
    const data = String(r[dataAt]);
    const first = r.map((v, i) => (i === dataAt ? "" : v));
    out.push(`INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${first.map(lit).join(", ")});`);
    for (let i = 0; i < data.length; i += 20_000) {
      out.push(`UPDATE ${table} SET data = data || ${lit(data.slice(i, i + 20_000))} WHERE ${key} = ${lit(r[0])};`);
    }
  }
  return out;
}

const { items, entities, reviews, prefs } = importOrbitExport(JSON.parse(readFileSync(input, "utf8")));
const now = Date.now();
const prefRows = noPrefs ? [] : Object.entries(prefs).map(([key, value]) => [key, JSON.stringify(value), now]);
const lines = [
  "-- Orbit import. Generated " + new Date().toISOString(),
  ...insert(
    "items",
    ["id", "kind", "title", "status", "archived", "deleted", "entity_id", "due", "data", "created_at", "updated_at"],
    items.map(itemRow),
  ),
  ...insert(
    "entities",
    ["id", "name", "category", "confidence", "imdb", "data", "updated_at"],
    entities.map(entityRow),
  ),
  ...insert("reviews", ["entity_id", "decision", "at"], reviews.map(reviewRow)),
  ...insert("prefs", ["key", "value", "updated_at"], prefRows),
];
// Queue unlinked movies, shows, games (with a year) and books (with an author) so the enricher
// links them over the next days. Back-fill mode keeps only sure matches.
const queued = noEnqueue ? [] : items.filter((i) => !i.entityId && !i.deleted && backfillable(i));
lines.push(
  ...queued.map(
    (i) =>
      `INSERT OR IGNORE INTO enrich_queue (item_id, mode, attempts, not_before, created_at) VALUES (${lit(i.id)}, 'backfill', 0, ${now}, ${now});`,
  ),
);
const biggest = Math.max(...lines.map((l) => Buffer.byteLength(l)));
if (biggest > 100_000) throw new Error(`A statement is ${biggest} bytes; D1 allows 100 KB.`);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, lines.join("\n") + "\n");
console.log(
  `Wrote ${output}: ${items.length} items, ${entities.length} linked things, ${reviews.length} reviews, ` +
    `${queued.length} queued for linking, settings: ${prefRows.map((r) => r[0]).join(", ") || "none"}.`,
);
