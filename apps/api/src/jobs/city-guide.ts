import {
  CITIES,
  GUIDE_STEPS,
  OSM_BATCH,
  PLACE_CATEGORIES,
  WIKI_BATCH,
  distanceMiles,
  findCity,
  findCityQid,
  findCityWorks,
  findGroup,
  mergeDetails,
  osmDetails,
  wikiDetails,
  type CityCenter,
  type CityGroup,
  type PlaceDetails,
} from "@orbit/core";
import type { Env } from "../env.js";
import type { Budget } from "./shared.js";

/**
 * The city rule (rules in `packages/core/src/city-guide.ts`), one small step per cron run:
 * 1. Once a day, find the cities Sid's places are in (1 call).
 * 2. One step of one city that is due: its Wikidata id, then each group, then Orbit connections
 *    (1 read, 1 outside request, 1 save).
 * 3. Details for suggested places that have none or are a quarter old (1 read, up to 3 outside
 *    requests, 1 save).
 */

const DAY = 86_400_000;
/** A city's full pass is done again this often: places open, close and get articles. */
export const CITY_REFRESH = 90 * DAY;
/** Place details are read again this often (opening hours change). */
export const DETAILS_REFRESH = 90 * DAY;
/** After a failed step: wait 6 hours, then a day; after the third failure, skip that step and go on in a week. */
const RETRY = [6 * 3_600_000, DAY, 7 * DAY];
/** A place name must be on this many of Sid's places to count as a city of his. */
const MIN_PLACES = 3;
/** A place counts toward the nearest known city within this many miles. */
const CITY_MILES = 40;

/** Subrequests the city rule needs in a run; live watch leaves this much (see jobs/shared.ts). */
export const CITY_RESERVE = 9;

const placeCategories = [...PLACE_CATEGORIES].map((c) => `'${c}'`).join(",");

/** Where Sid's places are: each location name and rough spot, with how many places share it. */
const PLACE_SPOTS = `SELECT json_extract(e.data, '$.location') AS location,
    ROUND(json_extract(e.data, '$.lat'), 1) AS lat, ROUND(json_extract(e.data, '$.lng'), 1) AS lng, COUNT(*) AS n
  FROM entities e WHERE e.category IN (${placeCategories}) GROUP BY 1, 2, 3`;

interface Spot {
  location: string | null;
  lat: number | null;
  lng: number | null;
  n: number;
}

/** The cities these places are in: a known city by name or nearby, or a name on at least `MIN_PLACES`. */
export function citiesOf(spots: Spot[]): CityCenter[] {
  const found = new Map<string, CityCenter & { n: number }>();
  const add = (c: CityCenter, n: number) => {
    const key = c.name.toLowerCase();
    const cur = found.get(key);
    found.set(key, { ...c, n: (cur?.n ?? 0) + n });
  };
  // Unknown names: average their places' spots, then count them as cities if there are enough.
  const unknown = new Map<string, { name: string; lat: number; lng: number; spots: number; n: number }>();
  for (const s of spots) {
    const name = s.location?.split(",")[0]?.trim();
    const known = s.location ? findCity(s.location) : null;
    if (known) {
      add(known, s.n);
      continue;
    }
    if (s.lat != null && s.lng != null) {
      const near = CITIES.map((c) => ({ c, d: distanceMiles(c, { lat: s.lat!, lng: s.lng! }) })).sort(
        (a, b) => a.d - b.d,
      )[0];
      if (near && near.d <= CITY_MILES) {
        add(near.c, s.n);
        continue;
      }
      if (name && name.length <= 40 && /\p{L}/u.test(name)) {
        const u = unknown.get(name.toLowerCase()) ?? { name, lat: 0, lng: 0, spots: 0, n: 0 };
        u.lat += s.lat;
        u.lng += s.lng;
        u.spots++;
        u.n += s.n;
        unknown.set(name.toLowerCase(), u);
      }
    }
  }
  for (const u of unknown.values())
    if (u.n >= MIN_PLACES) add({ name: u.name, lat: u.lat / u.spots, lng: u.lng / u.spots }, u.n);
  return [...found.values()].map(({ name, lat, lng }) => ({ name, lat, lng }));
}

interface CityRow {
  key: string;
  name: string;
  lat: number;
  lng: number;
  qid: string | null;
  step: number;
  failures: number;
}

export interface CityRunResult {
  found: number;
  step: string | null;
  suggestions: number;
  details: number;
  failed: number;
}

/** Records the cities Sid's places are in. Cities he turned off stay off; ones already known keep their progress. */
async function discover(env: Env, budget: Budget, now: number): Promise<number> {
  budget.db();
  const { results } = await env.DB.prepare(PLACE_SPOTS).all<Spot>();
  const cities = citiesOf(results);
  if (!cities.length) return 0;
  budget.db();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO cities (key, name, lat, lng, source, step, next_check)
      SELECT lower(json_extract(value, '$.name')), json_extract(value, '$.name'), json_extract(value, '$.lat'),
        json_extract(value, '$.lng'), 'places', 0, ?1 FROM json_each(?2) WHERE true
      ON CONFLICT(key) DO NOTHING`,
    ).bind(now, JSON.stringify(cities)),
    env.DB.prepare(
      `INSERT INTO job_state (key, value) VALUES ('cities_found', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).bind(String(now)),
  ]);
  return cities.length;
}

/** Runs the next step of the city that is most overdue. */
async function cityStep(env: Env, budget: Budget, now: number, out: CityRunResult): Promise<void> {
  budget.db();
  const city = await env.DB.prepare(
    `SELECT key, name, lat, lng, qid, step, failures FROM cities
    WHERE off = 0 AND next_check IS NOT NULL AND next_check <= ? ORDER BY next_check LIMIT 1`,
  )
    .bind(now)
    .first<CityRow>();
  if (!city) return;
  const step = GUIDE_STEPS[city.step] ?? "city";
  out.step = `${city.name}: ${step}`;
  const center: CityCenter = { name: city.name, lat: city.lat, lng: city.lng };
  const next = city.step + 1 >= GUIDE_STEPS.length ? 0 : city.step + 1;
  // The next step runs on the next cron run; a finished pass waits for CITY_REFRESH.
  const nextCheck = next === 0 ? now + CITY_REFRESH : now;
  const advance = env.DB.prepare(
    `UPDATE cities SET step = ?2, next_check = ?3, checked_at = ?4, error = NULL, failures = 0,
      done_at = CASE WHEN ?2 = 0 THEN ?4 ELSE done_at END WHERE key = ?1`,
  ).bind(city.key, next, nextCheck, now);
  try {
    if (step === "city") {
      const qid = await findCityQid(budget.fetch, center);
      budget.db();
      if (!qid) {
        // Not a city Wikidata knows by this name: stop until Sid adds it again.
        await env.DB.prepare(`UPDATE cities SET next_check = NULL, checked_at = ?2, error = 'not found' WHERE key = ?1`)
          .bind(city.key, now)
          .run();
        out.failed++;
        return;
      }
      await env.DB.batch([env.DB.prepare(`UPDATE cities SET qid = ?2 WHERE key = ?1`).bind(city.key, qid), advance]);
      return;
    }
    const found =
      step === "connections"
        ? city.qid
          ? (await findCityWorks(budget.fetch, city.qid)).map((w) => ({ ...w, group: "connections" as const }))
          : []
        : await findGroup(budget.fetch, center, step as CityGroup, now);
    budget.db();
    // Replaces the group's list, keeping what Sid hid as hidden.
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO city_suggestions (city, qid, grp, data, fame, seen_at)
        SELECT ?1, json_extract(value, '$.qid'), ?2, value, json_extract(value, '$.fame'), ?3 FROM json_each(?4) WHERE true
        ON CONFLICT(city, qid) DO UPDATE SET grp = excluded.grp, data = excluded.data, fame = excluded.fame, seen_at = excluded.seen_at`,
      ).bind(city.key, step, now, JSON.stringify(found)),
      env.DB.prepare(`DELETE FROM city_suggestions WHERE city = ?1 AND grp = ?2 AND seen_at < ?3`).bind(
        city.key,
        step,
        now,
      ),
      advance,
    ]);
    out.suggestions += found.length;
  } catch (err) {
    if (budget.left < 1) throw err;
    out.failed++;
    const failures = city.failures + 1;
    budget.db();
    await env.DB.prepare(
      `UPDATE cities SET failures = ?2, error = ?3, checked_at = ?4, next_check = ?5,
        step = CASE WHEN ?7 = 1 THEN ?6 ELSE step END WHERE key = ?1`,
    )
      .bind(
        city.key,
        failures >= 3 ? 0 : failures,
        String(err).slice(0, 200),
        now,
        now + RETRY[Math.min(failures, RETRY.length) - 1]!,
        next,
        failures >= 3 ? 1 : 0,
      )
      .run();
  }
}

/** Details for suggested places (not people or works) that have none yet or are due again. */
async function fillDetails(env: Env, budget: Budget, now: number): Promise<number> {
  budget.db();
  const { results } = await env.DB.prepare(
    `SELECT s.qid, json_extract(s.data, '$.wikipedia') AS wikipedia FROM city_suggestions s
    LEFT JOIN place_details d ON d.qid = s.qid
    WHERE s.hidden = 0 AND s.grp != 'connections' AND (d.qid IS NULL OR d.next_check <= ?)
    GROUP BY s.qid ORDER BY d.qid IS NOT NULL, MAX(s.fame) DESC LIMIT ?`,
  )
    .bind(now, OSM_BATCH)
    .all<{ qid: string; wikipedia: string | null }>();
  if (!results.length) return 0;
  const qids = results.map((r) => r.qid);
  const osm = await osmDetails(budget.fetch, qids);
  const titled = results.filter((r) => r.wikipedia);
  const wiki = new Map<string, PlaceDetails>();
  for (let i = 0; i < titled.length && budget.has(2); i += WIKI_BATCH) {
    const batch = titled.slice(i, i + WIKI_BATCH);
    const got = await wikiDetails(
      budget.fetch,
      batch.map((r) => r.wikipedia!),
    );
    for (const r of batch) if (got.has(r.wikipedia!)) wiki.set(r.qid, got.get(r.wikipedia!)!);
  }
  const rows = results.map((r) => ({ qid: r.qid, data: mergeDetails(osm.get(r.qid), wiki.get(r.qid)) }));
  budget.db();
  await env.DB.prepare(
    `INSERT INTO place_details (qid, data, fetched_at, next_check)
    SELECT json_extract(value, '$.qid'), json(json_extract(value, '$.data')), ?1, ?2 FROM json_each(?3) WHERE true
    ON CONFLICT(qid) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at, next_check = excluded.next_check`,
  )
    .bind(now, now + DETAILS_REFRESH, JSON.stringify(rows))
    .run();
  return rows.length;
}

/** One cron run's share of the city rule. Errors in one part don't stop the others. */
export async function runCityGuide(env: Env, budget: Budget, now = Date.now()): Promise<CityRunResult> {
  const out: CityRunResult = { found: 0, step: null, suggestions: 0, details: 0, failed: 0 };
  if (!budget.has(3)) return out;
  try {
    budget.db();
    const last = await env.DB.prepare(`SELECT value FROM job_state WHERE key = 'cities_found'`).first<string>("value");
    if (!last || Number(last) <= now - DAY) out.found = await discover(env, budget, now);
  } catch (err) {
    console.error(JSON.stringify({ job: "cities", step: "discover", error: String(err) }));
    out.failed++;
  }
  if (budget.has(3))
    await cityStep(env, budget, now, out).catch((err) => {
      console.error(JSON.stringify({ job: "cities", step: "city", error: String(err) }));
      out.failed++;
    });
  if (budget.has(3))
    out.details = await fillDetails(env, budget, now).catch((err) => {
      console.error(JSON.stringify({ job: "cities", step: "details", error: String(err) }));
      out.failed++;
      return 0;
    });
  return out;
}
