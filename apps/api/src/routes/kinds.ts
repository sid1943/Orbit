import {
  findKind,
  kindList,
  kindNameProblem,
  parseCustomKinds,
  reorderKinds,
  suggestHue,
  type CustomKind,
  type KindInfo,
} from "@orbit/core";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";

/**
 * Kinds: the 13 standard ones, then Sid's own (custom kinds), stored in order as the `kinds` row of `prefs`.
 * Only this route changes that row (`PUT /api/prefs/kinds` is refused), so names are always checked
 * and a rename always moves the cards.
 */
export const kinds = new Hono<AppEnv>();

export const KINDS_KEY = "kinds";

/** A kind with how many cards (not deleted) it has. */
export type KindWithCount = KindInfo & { count: number };

const SAVE = `INSERT INTO prefs (key, value, updated_at) VALUES (?1, ?2, ?3)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`;

async function readCustom(db: D1Database): Promise<CustomKind[]> {
  const row = await db.prepare("SELECT value FROM prefs WHERE key = ?").bind(KINDS_KEY).first<{ value: string }>();
  return row ? parseCustomKinds(JSON.parse(row.value)) : [];
}

const save = (db: D1Database, custom: readonly CustomKind[], now: number) =>
  db.prepare(SAVE).bind(KINDS_KEY, JSON.stringify(custom), now);

async function withCounts(db: D1Database, custom: readonly CustomKind[]): Promise<KindWithCount[]> {
  const { results } = await db
    .prepare("SELECT lower(kind) AS kind, COUNT(*) AS n FROM items WHERE deleted = 0 GROUP BY lower(kind)")
    .all<{ kind: string; n: number }>();
  const counts = new Map(results.map((r) => [r.kind, r.n]));
  return kindList(custom).map((k) => ({ ...k, count: counts.get(k.name.toLowerCase()) ?? 0 }));
}

const hueProblem = (hue: unknown): string | null =>
  typeof hue === "number" && Number.isFinite(hue) && hue >= 0 && hue <= 360
    ? null
    : "hue must be a number from 0 to 360";

const body = async (c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown> | null> => {
  const b = await c.req.json().catch(() => null);
  return typeof b === "object" && b !== null && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
};

/** Every kind in order (standard, then custom), each with its hue, place in the order and card count. */
kinds.get("/", async (c) => {
  return c.json({ kinds: await withCounts(c.env.DB, await readCustom(c.env.DB)) });
});

/** Add a kind after the others: `{ name, hue? }`. Without a hue it gets one far from the others. */
kinds.post("/", async (c) => {
  const b = await body(c);
  if (!b) return c.json({ error: "send JSON" }, 400);
  const db = c.env.DB;
  const custom = await readCustom(db);
  const all = kindList(custom);
  const problem = kindNameProblem(b.name, all) ?? (b.hue === undefined ? null : hueProblem(b.hue));
  if (problem) return c.json({ error: problem }, 400);
  const added: CustomKind = {
    name: String(b.name).trim(),
    hue: b.hue === undefined ? suggestHue(all) : Math.round(Number(b.hue)) % 360,
  };
  const next = [...custom, added];
  await save(db, next, Date.now()).run();
  const list = await withCounts(db, next);
  return c.json({ kind: list[list.length - 1], kinds: list }, 201);
});

/** Put the custom kinds in a new order: `{ names: [...] }`, each custom kind once. */
kinds.put("/order", async (c) => {
  const b = await body(c);
  const names = b?.names;
  const db = c.env.DB;
  const custom = await readCustom(db);
  const next = Array.isArray(names) ? reorderKinds(custom, names as string[]) : null;
  if (!next) return c.json({ error: "names must list every custom kind once" }, 400);
  await save(db, next, Date.now()).run();
  return c.json({ kinds: await withCounts(db, next) });
});

/** Rename and/or recolour a custom kind: `{ name?, hue? }`. A rename moves its cards to the new name. */
kinds.patch("/:name", async (c) => {
  const b = await body(c);
  if (!b) return c.json({ error: "send JSON" }, 400);
  const db = c.env.DB;
  const custom = await readCustom(db);
  const kind = findKind(c.req.param("name"), kindList(custom));
  if (!kind) return c.json({ error: "no such kind" }, 404);
  if (kind.standard) return c.json({ error: `${kind.name} is a standard kind and can't be changed` }, 400);
  const problem =
    (b.name === undefined ? null : kindNameProblem(b.name, kindList(custom), kind.name)) ??
    (b.hue === undefined ? null : hueProblem(b.hue));
  if (problem) return c.json({ error: problem }, 400);
  const name = b.name === undefined ? kind.name : String(b.name).trim();
  const hue = b.hue === undefined ? kind.hue : Math.round(Number(b.hue)) % 360;
  const next = custom.map((k) => (k.name === kind.name ? { name, hue } : k));
  const now = Date.now();
  const stmts = [save(db, next, now)];
  if (name !== kind.name)
    stmts.push(
      db
        .prepare(
          `UPDATE items SET kind = ?1, data = json_set(data, '$.kind', ?1, '$.updatedAt', ?2), updated_at = ?2
          WHERE lower(kind) = lower(?3)`,
        )
        .bind(name, now, kind.name),
    );
  const moved =
    name !== kind.name
      ? ((
          await db
            .prepare("SELECT COUNT(*) AS n FROM items WHERE lower(kind) = lower(?)")
            .bind(kind.name)
            .first<{ n: number }>()
        )?.n ?? 0)
      : 0;
  await db.batch(stmts);
  return c.json({ kinds: await withCounts(db, next), moved });
});

/** Delete a custom kind that has no cards. Otherwise 409 with how many it has. */
kinds.delete("/:name", async (c) => {
  const db = c.env.DB;
  const custom = await readCustom(db);
  const kind = findKind(c.req.param("name"), kindList(custom));
  if (!kind) return c.json({ error: "no such kind" }, 404);
  if (kind.standard) return c.json({ error: `${kind.name} is a standard kind and can't be deleted` }, 400);
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM items WHERE deleted = 0 AND lower(kind) = lower(?)")
    .bind(kind.name)
    .first<{ n: number }>();
  const count = row?.n ?? 0;
  if (count > 0)
    return c.json(
      { error: `${kind.name} has ${count} card${count === 1 ? "" : "s"}; move or delete them first`, count },
      409,
    );
  const next = custom.filter((k) => k.name !== kind.name);
  await save(db, next, Date.now()).run();
  return c.json({ kinds: await withCounts(db, next) });
});
