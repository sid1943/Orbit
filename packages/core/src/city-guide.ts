import { qidOf, sparql, workType, type WorkType } from "./connections.js";
import type { Fetch } from "./enrich.js";
import { distanceMiles } from "./today.js";

/**
 * The city rule (Sid, 2026-11-24): when a city is in Orbit, suggest everything worth doing there,
 * grouped as Nature, Culture and history, Food and drink, Experiences and Orbit connections.
 * There is no "top 5": everything goes in unless it is wrong (closed, no coordinates, no Wikipedia
 * article in any language, or no English name). Sid hides the wrong ones he still finds.
 * Sources are free and keyless: Wikidata for the places, OpenStreetMap and Wikipedia for their details.
 * TripAdvisor is a link only.
 */

export type CityGroup = "nature" | "culture" | "food" | "experiences";
export type GuideStep = "city" | CityGroup | "connections";

/** The steps a city goes through, one outside request each, in this order. */
export const GUIDE_STEPS: readonly GuideStep[] = ["city", "nature", "culture", "food", "experiences", "connections"];

export const GROUP_LABELS: Record<CityGroup | "connections", string> = {
  nature: "Nature",
  culture: "Culture and history",
  food: "Food and drink",
  experiences: "Experiences",
  connections: "Orbit connections",
};

/** Kilometres from the city center: in town, and within about two hours' drive (nature, day trips). */
export const NEAR_KM = 30;
export const FAR_KM = 150;

export interface GuideClass {
  qid: string;
  label: string;
  group: CityGroup;
  /** Searched within `FAR_KM` instead of `NEAR_KM`. */
  far?: boolean;
  /** Least Wikipedia and sister-site articles (sitelinks) to count: kinds with many minor entries ask for more. */
  minLinks?: number;
}

/**
 * Wikidata classes per group. An item counts when it is an instance of one of these or of a direct
 * subclass (an art museum is a museum). The order is the order types are named in.
 */
export const GUIDE_CLASSES: readonly GuideClass[] = [
  // Nature, within about two hours.
  { qid: "Q34038", label: "Waterfall", group: "nature", far: true },
  { qid: "Q8502", label: "Mountain", group: "nature", far: true, minLinks: 2 },
  { qid: "Q8072", label: "Volcano", group: "nature", far: true },
  { qid: "Q150784", label: "Canyon", group: "nature", far: true },
  { qid: "Q35509", label: "Cave", group: "nature", far: true },
  { qid: "Q177380", label: "Hot spring", group: "nature", far: true },
  { qid: "Q35666", label: "Glacier", group: "nature", far: true },
  { qid: "Q46169", label: "National park", group: "nature", far: true },
  { qid: "Q179049", label: "Nature reserve", group: "nature", far: true, minLinks: 2 },
  { qid: "Q40080", label: "Beach", group: "nature", far: true },
  { qid: "Q23397", label: "Lake", group: "nature", far: true, minLinks: 3 },
  { qid: "Q2143825", label: "Hiking trail", group: "nature", far: true },
  { qid: "Q167346", label: "Botanical garden", group: "nature" },
  { qid: "Q22698", label: "Park", group: "nature", minLinks: 2 },
  // Culture and history, in town.
  { qid: "Q33506", label: "Museum", group: "culture" },
  { qid: "Q9259", label: "World Heritage Site", group: "culture", far: true },
  { qid: "Q839954", label: "Archaeological site", group: "culture" },
  { qid: "Q23413", label: "Castle", group: "culture", far: true },
  { qid: "Q57821", label: "Fort", group: "culture" },
  { qid: "Q16560", label: "Palace", group: "culture" },
  { qid: "Q4989906", label: "Monument", group: "culture", minLinks: 2 },
  { qid: "Q5003624", label: "Memorial", group: "culture", minLinks: 2 },
  { qid: "Q2977", label: "Cathedral", group: "culture" },
  { qid: "Q16970", label: "Church", group: "culture", minLinks: 3 },
  { qid: "Q842402", label: "Hindu temple", group: "culture" },
  { qid: "Q5393308", label: "Buddhist temple", group: "culture" },
  { qid: "Q32815", label: "Mosque", group: "culture", minLinks: 2 },
  { qid: "Q34627", label: "Synagogue", group: "culture", minLinks: 2 },
  { qid: "Q39715", label: "Lighthouse", group: "culture", far: true },
  { qid: "Q62832", label: "Observatory", group: "culture", far: true },
  { qid: "Q12280", label: "Bridge", group: "culture", minLinks: 4 },
  { qid: "Q11303", label: "Skyscraper", group: "culture", minLinks: 4 },
  { qid: "Q12518", label: "Tower", group: "culture", minLinks: 3 },
  { qid: "Q15243209", label: "Historic district", group: "culture" },
  { qid: "Q123705", label: "Neighbourhood", group: "culture", minLinks: 2 },
  { qid: "Q570116", label: "Tourist attraction", group: "culture" },
  // Food and drink. Wikidata has few restaurants; city editions from Reddit fill this in when asked.
  { qid: "Q37654", label: "Market", group: "food" },
  { qid: "Q11707", label: "Restaurant", group: "food" },
  { qid: "Q131734", label: "Brewery", group: "food" },
  { qid: "Q156362", label: "Winery", group: "food", far: true },
  // Experiences.
  { qid: "Q483110", label: "Stadium", group: "experiences" },
  { qid: "Q641226", label: "Arena", group: "experiences" },
  { qid: "Q194195", label: "Amusement park", group: "experiences", far: true },
  { qid: "Q43501", label: "Zoo", group: "experiences" },
  { qid: "Q2281788", label: "Aquarium", group: "experiences", far: true },
  { qid: "Q24354", label: "Theatre", group: "experiences", minLinks: 2 },
  { qid: "Q1060829", label: "Concert hall", group: "experiences" },
  { qid: "Q130003", label: "Ski resort", group: "experiences", far: true },
];

export interface CityCenter {
  name: string;
  lat: number;
  lng: number;
}

/** One suggested place. */
export interface Suggestion {
  qid: string;
  name: string;
  group: CityGroup;
  /** The kind of place, as named in `GUIDE_CLASSES` ("Waterfall"). */
  type: string;
  lat: number;
  lng: number;
  /** Miles from the city center, rounded. */
  miles: number;
  /** Wikipedia and sister-site articles about it: how well known it is, used for ordering. */
  fame: number;
  /** English Wikipedia article title. */
  wikipedia?: string;
  /** Wikidata's TripAdvisor id (P3134), when it has one. */
  tripadvisor?: string;
  website?: string;
  /** Wikimedia Commons file name of its main picture. */
  image?: string;
  /** A UNESCO World Heritage Site. */
  heritage?: boolean;
}

/** A movie, show, book, game or person tied to the city. */
export interface CityWork {
  qid: string;
  name: string;
  type: WorkType | "person";
  /** How it is tied: set there, filmed there, or (people) born there. */
  how: "set" | "filmed" | "born";
  fame: number;
  year?: number;
}

type Row = Record<string, string | undefined>;
const lit = (s: string): string => JSON.stringify(s.replace(/[^\p{L}\p{N} .,'()-]/gu, ""));
const point = (c: Pick<CityCenter, "lat" | "lng">): string =>
  `"Point(${c.lng.toFixed(5)} ${c.lat.toFixed(5)})"^^geo:wktLiteral`;

/**
 * Finds the city's Wikidata id: a city or town (any subclass) with this English name within 25 km
 * of its center, the best known first.
 */
export function cityQuery(c: CityCenter): string {
  const name = c.name.split(",")[0]!.trim().toLowerCase();
  return `SELECT ?item ?links WHERE {
  SERVICE wikibase:around { ?item wdt:P625 ?loc . bd:serviceParam wikibase:center ${point(c)} . bd:serviceParam wikibase:radius "25" . }
  ?item wdt:P31/wdt:P279* wd:Q486972 ; rdfs:label ?label ; wikibase:sitelinks ?links .
  FILTER(LANG(?label) = "en" && LCASE(STR(?label)) = ${lit(name)})
} ORDER BY DESC(?links) LIMIT 1`;
}

export async function findCityQid(fetch: Fetch, c: CityCenter): Promise<string | null> {
  const rows = await sparql(fetch, cityQuery(c));
  return qidOf(rows[0]?.item) ?? null;
}

/** The places of one group around a city, near and far classes in one query. */
export function groupQuery(c: CityCenter, group: CityGroup): string {
  const classes = GUIDE_CLASSES.filter((k) => k.group === group);
  const part = (far: boolean): string => {
    const list = classes.filter((k) => !!k.far === far);
    if (!list.length) return "";
    return `{
    SERVICE wikibase:around { ?item wdt:P625 ?loc . bd:serviceParam wikibase:center ${point(c)} . bd:serviceParam wikibase:radius "${far ? FAR_KM : NEAR_KM}" . }
    VALUES ?class { ${list.map((k) => `wd:${k.qid}`).join(" ")} }
    { ?item wdt:P31 ?class } UNION { ?item wdt:P31/wdt:P279 ?class } UNION { ?item wdt:P1435 ?class }
  }`;
  };
  const parts = [part(false), part(true)].filter(Boolean).join(" UNION ");
  return `SELECT ?item ?itemLabel ?class ?loc ?links ?article ?ta ?site ?img ?closed WHERE {
  ${parts}
  ?item wikibase:sitelinks ?links . FILTER(?links > 0)
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
  OPTIONAL { ?item wdt:P3134 ?ta . }
  OPTIONAL { ?item wdt:P856 ?site . }
  OPTIONAL { ?item wdt:P18 ?img . }
  OPTIONAL { ?item wdt:P576|wdt:P3999|wdt:P582 ?closed . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
}

const parsePoint = (wkt: string | undefined): { lat: number; lng: number } | null => {
  const m = wkt?.match(/Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/i);
  return m ? { lng: Number(m[1]), lat: Number(m[2]) } : null;
};

/**
 * Turns query rows into suggestions: one per place (the first matching class names its type),
 * leaving out what is wrong: closed (a dissolved, closing or end date in the past), no English name,
 * too little known for its kind, or outside its class's distance.
 */
export function parseGroupRows(rows: Row[], c: CityCenter, group: CityGroup, now = Date.now()): Suggestion[] {
  const byQid = new Map<string, { s: Suggestion; classIdx: number; closed: boolean }>();
  for (const r of rows) {
    const qid = qidOf(r.item);
    const classQid = qidOf(r.class);
    const at = parsePoint(r.loc);
    const name = r.itemLabel?.trim();
    if (!qid || !classQid || !at || !name || /^Q\d+$/.test(name)) continue;
    const classIdx = GUIDE_CLASSES.findIndex((k) => k.qid === classQid && k.group === group);
    if (classIdx < 0) continue;
    const k = GUIDE_CLASSES[classIdx]!;
    const fame = Number(r.links ?? 0);
    const miles = distanceMiles(c, at);
    if (fame < (k.minLinks ?? 1) || miles > (k.far ? FAR_KM : NEAR_KM) / 1.609 + 1) continue;
    const closed = !!r.closed && Date.parse(r.closed) <= now;
    const cur = byQid.get(qid);
    const s: Suggestion = cur?.s ?? {
      qid,
      name,
      group,
      type: k.label,
      lat: at.lat,
      lng: at.lng,
      miles: Math.round(miles),
      fame,
    };
    if (r.article && !s.wikipedia)
      s.wikipedia = decodeURIComponent(r.article.split("/wiki/")[1] ?? "").replace(/_/g, " ");
    if (r.ta && !s.tripadvisor) s.tripadvisor = r.ta;
    if (r.site && !s.website) s.website = r.site;
    if (r.img && !s.image) s.image = decodeURIComponent(r.img.split("/").pop() ?? "").replace(/_/g, " ");
    // World Heritage is a flag; the first other class in GUIDE_CLASSES order names the type.
    const rank = classQid === "Q9259" ? GUIDE_CLASSES.length : classIdx;
    if (classQid === "Q9259") s.heritage = true;
    if (cur && rank < cur.classIdx) s.type = k.label;
    byQid.set(qid, { s, classIdx: Math.min(rank, cur?.classIdx ?? rank), closed: (cur?.closed ?? false) || closed });
  }
  return [...byQid.values()]
    .filter((v) => !v.closed)
    .map((v) => v.s)
    .sort((a, b) => b.fame - a.fame || a.name.localeCompare(b.name));
}

export async function findGroup(
  fetch: Fetch,
  c: CityCenter,
  group: CityGroup,
  now = Date.now(),
): Promise<Suggestion[]> {
  return parseGroupRows(await sparql(fetch, groupQuery(c, group)), c, group, now);
}

/** People born in the city count when this well known (a city has thousands). */
export const MIN_PERSON_LINKS = 25;

/** Movies, shows, books and games set or filmed in the city, and well-known people born there. */
export function connectionsQuery(cityQid: string): string {
  if (!/^Q\d+$/.test(cityQid)) throw new Error(`not a Wikidata id: ${cityQid}`);
  return `SELECT ?item ?itemLabel ?how ?type ?links ?date WHERE {
  { ?item wdt:P840 wd:${cityQid} . BIND("set" AS ?how) }
  UNION { ?item wdt:P915 wd:${cityQid} . BIND("filmed" AS ?how) }
  UNION { ?item wdt:P19 wd:${cityQid} ; wdt:P31 wd:Q5 . BIND("born" AS ?how) }
  ?item wdt:P31 ?type ; wikibase:sitelinks ?links .
  FILTER(?how != "born" || ?links >= ${MIN_PERSON_LINKS})
  OPTIONAL { ?item wdt:P577 ?date . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;
}

const HOW_ORDER = { set: 0, filmed: 1, born: 2 } as const;

/** One entry per thing: "set" wins over "filmed"; things that are neither a work nor a person are left out. */
export function parseConnectionRows(rows: Row[]): CityWork[] {
  const acc = new Map<string, { name: string; how: CityWork["how"]; types: string[]; fame: number; year?: number }>();
  for (const r of rows) {
    const qid = qidOf(r.item);
    const name = r.itemLabel?.trim();
    const how = r.how as CityWork["how"] | undefined;
    if (!qid || !name || /^Q\d+$/.test(name) || !how || !(how in HOW_ORDER)) continue;
    const cur = acc.get(qid) ?? { name, how, types: [], fame: Number(r.links ?? 0) };
    if (HOW_ORDER[how] < HOW_ORDER[cur.how]) cur.how = how;
    const t = qidOf(r.type);
    if (t && !cur.types.includes(t)) cur.types.push(t);
    const y = r.date ? Number(r.date.slice(0, 4)) : NaN;
    if (Number.isFinite(y) && (cur.year == null || y < cur.year)) cur.year = y;
    acc.set(qid, cur);
  }
  const out: CityWork[] = [];
  for (const [qid, v] of acc) {
    const type = v.how === "born" ? "person" : workType(v.types);
    if (type === "other" || type === "series" || type === "franchise") continue;
    out.push({ qid, name: v.name, type, how: v.how, fame: v.fame, ...(v.year != null ? { year: v.year } : {}) });
  }
  return out.sort((a, b) => b.fame - a.fame || a.name.localeCompare(b.name));
}

export async function findCityWorks(fetch: Fetch, cityQid: string): Promise<CityWork[]> {
  return parseConnectionRows(await sparql(fetch, connectionsQuery(cityQid)));
}

// ---- Links -------------------------------------------------------------------------------------

export interface PlaceLink {
  label: string;
  url: string;
}

/** Map, TripAdvisor (its page when Wikidata knows it, a search otherwise) and Wikipedia. */
export function suggestionLinks(s: Suggestion, cityName: string): PlaceLink[] {
  const q = encodeURIComponent(`${s.name}, ${cityName}`);
  const out: PlaceLink[] = [
    { label: "Map", url: `https://www.google.com/maps/search/?api=1&query=${s.lat.toFixed(5)},${s.lng.toFixed(5)}` },
    {
      label: "TripAdvisor",
      url: s.tripadvisor
        ? `https://www.tripadvisor.com/${encodeURI(s.tripadvisor)}`
        : `https://www.tripadvisor.com/Search?q=${q}`,
    },
  ];
  if (s.wikipedia)
    out.push({
      label: "Wikipedia",
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(s.wikipedia.replace(/ /g, "_"))}`,
    });
  if (s.website) out.push({ label: "Website", url: s.website });
  return out;
}

// ---- Matching Sid's own places -----------------------------------------------------------------

const GENERIC = new Set([
  "the",
  "a",
  "of",
  "and",
  "park",
  "museum",
  "state",
  "county",
  "national",
  "regional",
  "city",
  "garden",
  "gardens",
  "center",
  "centre",
  "historic",
  "site",
  "preserve",
  "open",
  "space",
  "hike",
  "visit",
  "go",
  "to",
  "at",
  "in",
  "on",
  "up",
  "or",
  "drive",
  "see",
  "do",
]);

/** Lower case, accents and punctuation gone, "Mt." as "mount" and "St." as "saint". */
export function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\bmt\.?\s/g, "mount ")
    .replace(/\bst\.?\s/g, "saint ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The words of a name that tell it apart ("Alum Rock Park" -> "alum rock"), without the city's own name. */
function core(s: string, city: string): string {
  const own = new Set(normName(city).split(" "));
  return normName(s)
    .split(" ")
    .filter((w) => w && !GENERIC.has(w) && !own.has(w))
    .join(" ");
}

/**
 * Whether one of Sid's rows ("Hike Alum Rock early") is this place ("Alum Rock Park"): the place's
 * telling words appear in the row as whole words, and are long enough not to match by chance.
 */
export function rowMatches(placeName: string, rowText: string, cityName = ""): boolean {
  const city = cityName.split(",")[0]!;
  const key = core(placeName, city);
  if (key.replace(/ /g, "").length < 5) return normName(placeName) === normName(rowText);
  return ` ${normName(rowText)} `.includes(` ${key} `) || ` ${core(rowText, city)} `.includes(` ${key} `);
}
