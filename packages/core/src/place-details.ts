import type { Fetch } from "./enrich.js";

/**
 * What every place carries (Sid, 2026-11-24), and where each piece comes from. All free and keyless:
 * OpenStreetMap (through Overpass, matched by the Wikidata id OSM keeps in its `wikidata` tag) for
 * hours, fees, phone, website and access; Wikipedia for the short history and the photo.
 * Visit length, best time and booking have no free source that says them reliably, so they stay
 * empty until Sid or a city edition fills them in.
 */
export interface PlaceDetails {
  /** OSM `opening_hours`, as written there ("Tu-Su 10:00-17:00"). */
  hours?: string;
  /** "yes", "no", or an amount from OSM's `charge`. */
  fee?: string;
  website?: string;
  phone?: string;
  /** Wikipedia's lead, up to three sentences. */
  history?: string;
  /** A picture from Wikipedia's page (Wikimedia Commons). */
  photo?: string;
  wheelchair?: "yes" | "limited" | "no";
  dogs?: "yes" | "leashed" | "no";
  /** OSM marks it disused or abandoned: a closure the city rule's Wikidata check may not know yet. */
  closed?: boolean;
  visitLength?: string;
  bestTime?: string;
  booking?: string;
}

/** The fields in the order a card shows them, with their names. */
export const PLACE_FIELDS: readonly (readonly [keyof PlaceDetails, string])[] = [
  ["hours", "Opening hours"],
  ["fee", "Entry fee"],
  ["website", "Website"],
  ["phone", "Phone"],
  ["photo", "Photo"],
  ["history", "History"],
  ["visitLength", "Visit length"],
  ["bestTime", "Best time"],
  ["booking", "Booking needed"],
  ["wheelchair", "Wheelchair"],
  ["dogs", "Dogs"],
  ["closed", "Closed for good"],
];

const OVERPASS = "https://overpass-api.de/api/interpreter";
const WIKIPEDIA = "https://en.wikipedia.org/w/api.php";
const UA = "Orbit/0.1 (personal tracker; https://github.com/sid1943/orbit)";

/** Most places in one Overpass request, and in one Wikipedia request (its limit for extracts). */
export const OSM_BATCH = 40;
export const WIKI_BATCH = 20;

type Tags = Record<string, string | undefined>;

export function overpassQuery(qids: string[]): string {
  const ids = qids.filter((q) => /^Q\d+$/.test(q));
  return `[out:json][timeout:25];nwr["wikidata"~"^(${ids.join("|")})$"];out tags;`;
}

const pick = <T extends string>(v: string | undefined, allowed: readonly T[]): T | undefined =>
  allowed.find((a) => a === v);

/** Details from one OSM element's tags. */
export function detailsFromTags(t: Tags): PlaceDetails {
  const d: PlaceDetails = {};
  if (t.opening_hours) d.hours = t.opening_hours;
  const fee = t.charge ?? t.fee;
  if (fee) d.fee = fee;
  const site = t.website ?? t["contact:website"];
  if (site && /^https?:\/\//.test(site)) d.website = site;
  const phone = t.phone ?? t["contact:phone"];
  if (phone) d.phone = phone;
  const wheel = pick(t.wheelchair, ["yes", "limited", "no"] as const);
  if (wheel) d.wheelchair = wheel;
  const dogs = pick(t.dog, ["yes", "leashed", "no"] as const);
  if (dogs) d.dogs = dogs;
  if (t["disused:amenity"] || t["disused:tourism"] || t["abandoned:tourism"] || t.disused === "yes") d.closed = true;
  return d;
}

interface OverpassJson {
  elements?: { tags?: Tags }[];
}

/**
 * OSM details by Wikidata id. Where OSM maps one place several times (a park's outline and its
 * entrance), the element with the most of these details wins.
 */
export async function osmDetails(fetch: Fetch, qids: string[]): Promise<Map<string, PlaceDetails>> {
  const out = new Map<string, PlaceDetails>();
  if (!qids.length) return out;
  const r = await fetch(OVERPASS, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(overpassQuery(qids))}`,
  });
  if (!r.ok) throw new Error(`Overpass failed: HTTP ${r.status}`);
  const json = (await r.json()) as OverpassJson;
  for (const el of json.elements ?? []) {
    const qid = el.tags?.wikidata;
    if (!qid || !qids.includes(qid)) continue;
    const d = detailsFromTags(el.tags!);
    const cur = out.get(qid);
    if (!cur || Object.keys(d).length > Object.keys(cur).length) out.set(qid, d);
  }
  return out;
}

interface WikiJson {
  query?: {
    normalized?: { from: string; to: string }[];
    redirects?: { from: string; to: string }[];
    pages?: { title: string; extract?: string; thumbnail?: { source: string }; missing?: boolean }[];
  };
}

/** Wikipedia's lead (up to three sentences) and picture, by article title. */
export async function wikiDetails(fetch: Fetch, titles: string[]): Promise<Map<string, PlaceDetails>> {
  const out = new Map<string, PlaceDetails>();
  if (!titles.length) return out;
  const params = new URLSearchParams({
    action: "query",
    prop: "extracts|pageimages",
    exintro: "1",
    explaintext: "1",
    exsentences: "3",
    exlimit: String(WIKI_BATCH),
    piprop: "thumbnail",
    pithumbsize: "640",
    pilimit: String(WIKI_BATCH),
    redirects: "1",
    format: "json",
    formatversion: "2",
    titles: titles.slice(0, WIKI_BATCH).join("|"),
  });
  const r = await fetch(`${WIKIPEDIA}?${params}`, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`Wikipedia failed: HTTP ${r.status}`);
  const json = (await r.json()) as WikiJson;
  // Map each asked title through Wikipedia's normalising and redirects to the page it landed on.
  const hop = new Map<string, string>();
  for (const n of [...(json.query?.normalized ?? []), ...(json.query?.redirects ?? [])]) hop.set(n.from, n.to);
  const pages = new Map((json.query?.pages ?? []).filter((p) => !p.missing).map((p) => [p.title, p]));
  for (const t of titles) {
    let at = t;
    for (let i = 0; i < 3 && hop.has(at); i++) at = hop.get(at)!;
    const p = pages.get(at);
    if (!p) continue;
    const d: PlaceDetails = {};
    if (p.extract?.trim()) d.history = p.extract.trim();
    if (p.thumbnail?.source) d.photo = p.thumbnail.source;
    out.set(t, d);
  }
  return out;
}

/** OSM's answer first, then Wikipedia's for what OSM doesn't say. */
export function mergeDetails(...parts: (PlaceDetails | undefined)[]): PlaceDetails {
  const out: PlaceDetails = {};
  for (const p of parts)
    if (p)
      for (const [k, v] of Object.entries(p)) if (v != null && !(k in out)) (out as Record<string, unknown>)[k] = v;
  return out;
}
