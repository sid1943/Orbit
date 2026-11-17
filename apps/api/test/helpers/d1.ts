import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type * as Sqlite from "node:sqlite";
import type { DatabaseSync as Db, SQLInputValue } from "node:sqlite";
import { fileURLToPath } from "node:url";

// Loaded with require: Vite drops the "node:" prefix that node:sqlite needs.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof Sqlite;
type DatabaseSync = Db;

/**
 * Enough of D1 for route tests, on Node's built-in SQLite, with the real migrations applied.
 * Like D1, `batch` runs its statements in one transaction.
 */
class Statement {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly args: SQLInputValue[] = [],
  ) {}

  bind(...args: unknown[]): Statement {
    return new Statement(this.db, this.sql, args as SQLInputValue[]);
  }

  async all<T>(): Promise<{ results: T[]; success: true; meta: object }> {
    return this.allSync<T>();
  }

  allSync<T>(): { results: T[]; success: true; meta: object } {
    const rows = this.db.prepare(this.sql).all(...this.args);
    return { results: rows.map((r) => ({ ...r }) as T), success: true, meta: {} };
  }

  async first<T>(col?: string): Promise<T | null> {
    const row = this.allSync<Record<string, unknown>>().results[0];
    if (!row) return null;
    return (col ? row[col] : row) as T;
  }

  async run(): Promise<{ success: true; meta: object }> {
    this.db.prepare(this.sql).run(...this.args);
    return { success: true, meta: {} };
  }
}

export function testDb(): { DB: D1Database; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(":memory:");
  const dir = fileURLToPath(new URL("../../migrations/", import.meta.url));
  for (const f of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync(dir + f, "utf8"));
  }
  const DB = {
    prepare: (sql: string) => new Statement(sqlite, sql),
    async batch(stmts: Statement[]) {
      sqlite.exec("BEGIN");
      try {
        const out = stmts.map((s) => s.allSync());
        sqlite.exec("COMMIT");
        return out;
      } catch (err) {
        sqlite.exec("ROLLBACK");
        throw err;
      }
    },
  };
  return { DB: DB as unknown as D1Database, sqlite };
}
