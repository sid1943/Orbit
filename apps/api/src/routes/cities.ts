import {
  GROUP_LABELS,
  GUIDE_STEPS,
  PLACE_FIELDS,
  findCity,
  rowMatches,
  suggestionLinks,
  type CityWork,
  type Item,
  type PlaceDetails,
  type Suggestion,
} from "@orbit/core";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";

/**
 * The city rule's suggestions (jobs/city-guide.ts). Read-only apart from adding or turning off a city
 * and hiding a suggestion that is wrong; adding a suggestion as a place is the card's job.
 */
export const cities = new Hono<AppEnv>();

const GROUPS = ["nature", "culture", "food", "experiences", "connections"] as const;

interface CityDbRow {
  key: string;
  name: string;
  lat: number;
  lng: number;
  qid: string | null;
  source: string;
  step: number;
  next_check: number | null;
  done_at: number | null;
  error: string | null;
  off: number;
}

const cityJson = (r: CityDbRow) => ({
  key: r.key,
  name: r.name,
  lat: r.lat,
  lng: r.lng,
  qid: r.qid,
  source: r.source,
  off: !!r.off,
  /** The step that runs next, while the first pass is still going (null once a pass is done and none is running). */
  working: !r.off && r.next_check != null && (r.done_at == null || r.step > 0) ? GUIDE_STEPS[r.step] : null,
  doneAt: r.done_at,
  error: r.error,
});

/** Every city with how many suggestions each group has. */
cities.get("/", async (c) => {
  const db = c.env.DB;
  const [list, counts] = await db.batch<Record<string, unknown>>([
    db.prepare(`SELECT * FROM cities ORDER BY off, name`),
    db.prepare(`SELECT city, grp, COUNT(*) AS n FROM city_suggestions WHERE hidden = 0 GROUP BY city, grp`),
  ]);
  const byCity = new Map<string, Record<string, number>>();
  for (const r of counts?.results ?? []) {
    const m = byCity.get(String(r.city)) ?? {};
    m[String(r.grp)] = Number(r.n);
    byCity.set(String(r.city), m);
  }
  return c.json({
    cities: (list?.results ?? []).map((r) => ({
      ...cityJson(r as unknown as CityDbRow),
      counts: byCity.get(String(r.key)) ?? {},
    })),
  });
});

/** Adds a city (by a name Orbit knows, or a name with its center) and starts its pass on the next run. */
cities.post("/", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { name?: unknown; lat?: unknown; lng?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 80) return c.json({ error: "name is required" }, 400);
  const known = findCity(name);
  const lat = known?.lat ?? (typeof body?.lat === "number" ? body.lat : NaN);
  const lng = known?.lng ?? (typeof body?.lng === "number" ? body.lng : NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    return c.json({ error: "unknown city: send lat and lng with it" }, 400);
  const city = { name: known?.name ?? name, lat, lng };
  const key = city.name.toLowerCase();
  await c.env.DB.prepare(
    `INSERT INTO cities (key, name, lat, lng, source, step, next_check) VALUES (?1, ?2, ?3, ?4, 'added', 0, ?5)
    ON CONFLICT(key) DO UPDATE SET off = 0, step = 0, failures = 0, error = NULL, next_check = ?5`,
  )
    .bind(key, city.name, lat, lng, Date.now())
    .run();
  return c.json({ key, ...city }, 201);
});

/** Turns a city off (no more suggestions or checks) or back on. */
cities.patch("/:key", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { off?: unknown } | null;
  if (typeof body?.off !== "boolean") return c.json({ error: "off must be true or false" }, 400);
  const r = await c.env.DB.prepare(
    `UPDATE cities SET off = ?2, next_check = CASE WHEN ?2 = 1 THEN NULL ELSE ?3 END WHERE key = ?1 RETURNING key`,
  )
    .bind(c.req.param("key").toLowerCase(), body.off ? 1 : 0, Date.now())
    .first();
  return r ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
});

/** Hides a suggestion that is wrong, or shows it again. */
cities.patch("/:key/suggestions/:qid", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { hidden?: unknown } | null;
  if (typeof body?.hidden !== "boolean") return c.json({ error: "hidden must be true or false" }, 400);
  const r = await c.env.DB.prepare(`UPDATE city_suggestions SET hidden = ?3 WHERE city = ?1 AND qid = ?2 RETURNING qid`)
    .bind(c.req.param("key").toLowerCase(), c.req.param("qid"), body.hidden ? 1 : 0)
    .first();
  return r ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
});

interface SidRow {
  itemId: string;
  checklist: number | null;
  row: number | null;
  text: string;
  done: boolean;
}

/** Sid's cards about this city (by title, list or linked place's location), as card titles and checklist rows. */
async function sidRows(db: D1Database, city: string): Promise<SidRow[]> {
  const like = `%${city.split(",")[0]!.trim().toLowerCase()}%`;
  const { results } = await db
    .prepare(
      `SELECT i.data FROM items i LEFT JOIN entities e ON e.id = i.entity_id
      WHERE i.deleted = 0 AND (lower(i.title) LIKE ?1 OR lower(json_extract(i.data, '$.source')) LIKE ?1
        OR lower(json_extract(e.data, '$.location')) LIKE ?1)`,
    )
    .bind(like)
    .all<{ data: string }>();
  const out: SidRow[] = [];
  for (const r of results) {
    const it = JSON.parse(r.data) as Item;
    out.push({ itemId: it.id, checklist: null, row: null, text: it.title, done: it.status === "done" });
    it.checklists.forEach((cl, ci) =>
      cl.rows.forEach((row, ri) =>
        out.push({ itemId: it.id, checklist: ci, row: ri, text: row.text, done: !!row.done }),
      ),
    );
  }
  return out;
}

/** One city's suggestions by group, each with its links, details and whether Sid already has it. */
cities.get("/:key", async (c) => {
  const db = c.env.DB;
  const key = c.req.param("key").toLowerCase();
  const withHidden = c.req.query("hidden") === "1";
  const city = await db.prepare(`SELECT * FROM cities WHERE key = ?`).bind(key).first<CityDbRow>();
  if (!city) return c.json({ error: "not found" }, 404);
  const { results } = await db
    .prepare(
      `SELECT s.grp, s.data, s.hidden, d.data AS details FROM city_suggestions s LEFT JOIN place_details d ON d.qid = s.qid
      WHERE s.city = ?1 AND (?2 = 1 OR s.hidden = 0) ORDER BY s.fame DESC`,
    )
    .bind(key, withHidden ? 1 : 0)
    .all<{ grp: string; data: string; hidden: number; details: string | null }>();
  const rows = await sidRows(db, city.name);

  // Works and people Sid has a card for, by Wikidata id.
  const workQids = results.filter((r) => r.grp === "connections").map((r) => (JSON.parse(r.data) as CityWork).qid);
  const cards = new Map<string, string>();
  if (workQids.length) {
    const { results: linked } = await db
      .prepare(
        `SELECT json_extract(e.data, '$.qid') AS qid, i.id FROM entities e JOIN items i ON i.entity_id = e.id
        WHERE i.deleted = 0 AND json_extract(e.data, '$.qid') IN (SELECT value FROM json_each(?))`,
      )
      .bind(JSON.stringify(workQids))
      .all<{ qid: string; id: string }>();
    for (const l of linked) cards.set(l.qid, l.id);
  }

  const groups: Record<string, { label: string; items: unknown[] }> = Object.fromEntries(
    GROUPS.map((g) => [g, { label: GROUP_LABELS[g], items: [] as unknown[] }]),
  );
  for (const r of results) {
    const group = groups[r.grp];
    if (!group) continue;
    if (r.grp === "connections") {
      const w = JSON.parse(r.data) as CityWork;
      const itemId = cards.get(w.qid);
      group.items.push({ ...w, hidden: !!r.hidden, mine: itemId ? { itemId } : null });
      continue;
    }
    const s = JSON.parse(r.data) as Suggestion;
    const mine = rows.find((x) => rowMatches(s.name, x.text, city.name)) ?? null;
    const details = r.details ? (JSON.parse(r.details) as PlaceDetails) : null;
    group.items.push({
      ...s,
      hidden: !!r.hidden,
      links: suggestionLinks(s, city.name),
      details,
      mine,
    });
  }
  return c.json({
    city: cityJson(city),
    fields: PLACE_FIELDS.map(([key, label]) => ({ key, label })),
    groups,
  });
});
