import { type AppearancePref, parseAppearance } from "./appearance.js";
import { type CustomKind, parseCustomKinds } from "./kinds.js";
import { type LocationPref, type Prefs, parseLocation } from "./prefs.js";
import type { Checklist, Confidence, Entity, Item, Review, ReviewDecision, Status } from "./types.js";
import { STATUSES } from "./types.js";

/**
 * Reads and writes the "Download everything" file (format "orbit-export", version 1),
 * made by Orbit today and by the web app. `ui` and `here` (settings) are optional, so older files still load.
 */

type RawRow = [string, number | boolean, (string | null)?, (string | null)?];
interface RawItem {
  id: string;
  t: string;
  k: string;
  s: string;
  tg?: string[];
  src?: string;
  p?: Record<string, string>;
  d?: string;
  due?: string;
  start?: string;
  a?: number | boolean;
  del?: number | boolean;
  ent?: string;
  lk?: string[];
  lnk?: [string, string, string?][];
  at?: [string, string][];
  cm?: [string, string][];
  cl?: { n: string; i: RawRow[] }[];
  _at?: number;
}
type RawEntity = Record<string, unknown> & { id?: string; n?: string; cat?: string; conf?: string };
type RawDecision = string | { d: string; [k: string]: unknown };

/** Orbit today's appearance and profile settings. `theme` is "auto", "light" or "dark". */
export interface RawUi {
  size?: number;
  font?: string;
  heads?: string;
  detail?: string;
  theme?: string;
  name?: string;
}

/** Orbit today's location. `src` is how it was set ("device", "city", ...); `at` is when. */
export interface RawHere {
  lat?: number;
  lng?: number;
  label?: string;
  src?: string;
  at?: number;
}

export interface OrbitExportV1 {
  format: "orbit-export";
  version: 1;
  exported: string;
  items: RawItem[];
  ent: Record<string, RawEntity>;
  reviews: Record<string, RawDecision>;
  /** Appearance and the greeting name. Optional: files from before 2026-11-17 don't have it. */
  ui?: RawUi;
  /** Location. Optional, and null when it was never set. */
  here?: RawHere | null;
  /** Kinds Sid added, in order. Optional: files from before custom kinds don't have it. */
  kinds?: CustomKind[];
}

/** Settings found in an export; a key is present only when the file had it. */
export type ImportedPrefs = Partial<Pick<Prefs, "appearance" | "profile">> & {
  location?: LocationPref;
  /** Custom kinds, stored as the `kinds` prefs row. */
  kinds?: CustomKind[];
};

export interface ImportResult {
  items: Item[];
  entities: Entity[];
  reviews: Review[];
  prefs: ImportedPrefs;
}

const KIND_RENAMES: Record<string, string> = { Goal: "To-do", Health: "To-do" };
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Entity field ↔ short key in the export file, and whether the value is text or a number. Also used to read guesses, which keep the short keys. */
export const ENTITY_FIELDS = [
  ["qid", "q", "s"],
  ["label", "label", "s"],
  ["description", "d", "s"],
  ["imdb", "imdb", "s"],
  ["igdb", "igdb", "s"],
  ["openLibrary", "ol", "s"],
  ["author", "author", "s"],
  ["year", "yr", "n"],
  ["wikipedia", "wp", "s"],
  ["website", "web", "s"],
  ["unesco", "un", "s"],
  ["steam", "steam", "s"],
  ["lat", "lat", "n"],
  ["lng", "lng", "n"],
  ["location", "loc", "s"],
  ["mapQuery", "mq", "s"],
  ["closed", "closed", "s"],
] as const satisfies readonly (readonly [keyof Entity, string, "s" | "n"])[];

export function mapEntity(id: string, r: RawEntity, now: number): Entity {
  const e: Entity = {
    id,
    name: str(r.n) ?? id,
    category: str(r.cat) ?? "card",
    confidence: (str(r.conf) ?? "none") as Confidence,
    updatedAt: num(r.updatedAt) ?? now,
  };
  const out = e as unknown as Record<string, unknown>;
  for (const [field, key, type] of ENTITY_FIELDS) {
    const v = type === "n" ? num(r[key]) : str(r[key]);
    if (v !== undefined) out[field] = v;
  }
  if (r.cand && typeof r.cand === "object") e.candidate = r.cand as Partial<Entity>;
  if (Array.isArray(r.alts)) e.alternatives = r.alts as Partial<Entity>[];
  return e;
}

export function mapItem(r: RawItem, now: number): Item {
  const status: Status = (STATUSES as readonly string[]).includes(r.s) ? (r.s as Status) : "todo";
  const checklists: Checklist[] = (r.cl ?? []).map((c) => ({
    name: c.n,
    rows: c.i.map(([text, done, ref, eid]) => ({ text, done: !!done, ref: ref ?? null, entityId: eid ?? null })),
  }));
  return {
    id: r.id,
    kind: KIND_RENAMES[r.k] ?? r.k,
    title: r.t,
    status,
    tags: r.tg ?? [],
    source: r.src ?? "",
    props: r.p ?? {},
    notes: r.d ?? "",
    due: r.due ? r.due.slice(0, 10) : null,
    start: r.start ?? null,
    archived: !!r.a,
    deleted: !!r.del,
    entityId: r.ent ?? null,
    refs: r.lk ?? [],
    links: (r.lnk ?? []).map(([label, url, note]) => (note ? { label, url, note } : { label, url })),
    attachments: (r.at ?? []).map(([label, url]) => ({ label, url })),
    comments: (r.cm ?? []).map(([date, text]) => ({ date, text })),
    checklists,
    coverId: null,
    createdAt: r._at ?? now,
    updatedAt: r._at ?? now,
  };
}

export function mapDecision(raw: RawDecision): ReviewDecision | null {
  const d = typeof raw === "string" ? raw : raw && typeof raw === "object" ? raw.d : null;
  const o = (typeof raw === "object" && raw ? raw : {}) as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === "string" && o[k] ? (o[k] as string) : undefined);
  switch (d) {
    case "yes":
    case "no":
    case "none":
      return { d };
    case "alt": {
      const qid = s("q");
      return qid ? { d: "alt", qid, ...(s("label") ? { label: s("label")! } : {}) } : null;
    }
    case "fix":
      return {
        d: "fix",
        ...(s("url") ? { url: s("url")! } : {}),
        ...(s("text") ? { text: s("text")! } : {}),
        add: !!o.add,
      };
    case "hide":
      return Array.isArray(o.urls)
        ? { d: "hide", urls: o.urls.filter((u): u is string => typeof u === "string") }
        : null;
    default:
      return null;
  }
}

/** Settings in an export: `ui` becomes `appearance` and `profile`, `here` becomes `location`. */
export function prefsFromExport(x: { ui?: unknown; here?: unknown; kinds?: unknown }): ImportedPrefs {
  const prefs: ImportedPrefs = {};
  const ui = x.ui;
  if (ui && typeof ui === "object" && !Array.isArray(ui)) {
    prefs.appearance = parseAppearance(ui);
    const name = (ui as RawUi).name;
    if (typeof name === "string" && name.trim()) prefs.profile = { name: name.trim() };
  }
  const location = parseLocation(x.here);
  if (location) prefs.location = location;
  if (x.kinds !== undefined) prefs.kinds = parseCustomKinds(x.kinds);
  return prefs;
}

export function importOrbitExport(data: unknown, now = Date.now()): ImportResult {
  const x = data as Partial<OrbitExportV1>;
  if (!x || x.format !== "orbit-export" || x.version !== 1 || !Array.isArray(x.items) || typeof x.ent !== "object") {
    throw new Error('Not an Orbit export file (expected format "orbit-export", version 1)');
  }
  const items = x.items.map((r) => mapItem(r, now));
  const entities = Object.entries(x.ent ?? {}).map(([id, r]) => mapEntity(id, r, now));
  const reviews: Review[] = [];
  for (const [entityId, raw] of Object.entries(x.reviews ?? {})) {
    const decision = mapDecision(raw);
    if (decision)
      reviews.push({ entityId, decision, at: typeof raw === "object" && typeof raw.at === "number" ? raw.at : now });
  }
  return { items, entities, reviews, prefs: prefsFromExport(x) };
}

/* ---------- Writing the file (the web app's "Download everything") ---------- */

export interface ExportInput {
  items: Item[];
  entities: Entity[];
  reviews: Review[];
  /** Settings to include; omit to leave `ui` and `here` out. */
  prefs?: Pick<Prefs, "appearance" | "profile" | "location">;
  /** Custom kinds, in order; omit to leave `kinds` out. */
  kinds?: readonly CustomKind[];
}

export function unmapItem(it: Item): RawItem {
  const r: RawItem = { id: it.id, t: it.title, k: it.kind, s: it.status, _at: it.updatedAt };
  if (it.tags.length) r.tg = it.tags;
  if (it.source) r.src = it.source;
  if (Object.keys(it.props).length) r.p = it.props;
  if (it.notes) r.d = it.notes;
  if (it.due) r.due = it.due;
  if (it.start) r.start = it.start;
  if (it.archived) r.a = 1;
  if (it.deleted) r.del = 1;
  if (it.entityId) r.ent = it.entityId;
  if (it.refs.length) r.lk = it.refs;
  if (it.links.length) r.lnk = it.links.map((l) => (l.note ? [l.label, l.url, l.note] : [l.label, l.url]));
  if (it.attachments.length) r.at = it.attachments.map((a) => [a.label, a.url]);
  if (it.comments.length) r.cm = it.comments.map((c) => [c.date, c.text]);
  if (it.checklists.length)
    r.cl = it.checklists.map((c) => ({
      n: c.name,
      i: c.rows.map((row): RawRow => [row.text, row.done ? 1 : 0, row.ref, row.entityId]),
    }));
  return r;
}

export function unmapEntity(e: Entity): RawEntity {
  const r: RawEntity = { n: e.name, cat: e.category, conf: e.confidence, updatedAt: e.updatedAt };
  for (const [field, key] of ENTITY_FIELDS) if (e[field] !== undefined) r[key] = e[field];
  if (e.candidate) r.cand = e.candidate;
  if (e.alternatives) r.alts = e.alternatives;
  return r;
}

export function unmapDecision(r: Review): RawDecision {
  const { decision: dec, at } = r;
  if (dec.d === "alt") return { d: "alt", q: dec.qid, ...(dec.label ? { label: dec.label } : {}), at };
  return { ...dec, at };
}

/** Settings as Orbit today keeps them, so either Orbit can read the file. */
export function uiFromPrefs(p: Pick<Prefs, "appearance" | "profile">): RawUi {
  const a: AppearancePref = p.appearance;
  return {
    size: a.size,
    font: a.font,
    detail: a.detail,
    heads: a.heads,
    theme: a.theme === "system" ? "auto" : a.theme,
    name: p.profile.name,
  };
}

/** Builds the "Download everything" file: the same format Orbit today writes, with settings included. */
export function exportOrbit(input: ExportInput, exported = new Date()): OrbitExportV1 {
  const file: OrbitExportV1 = {
    format: "orbit-export",
    version: 1,
    exported: exported.toISOString(),
    items: input.items.map(unmapItem),
    ent: Object.fromEntries(input.entities.map((e) => [e.id, unmapEntity(e)])),
    reviews: Object.fromEntries(input.reviews.map((r) => [r.entityId, unmapDecision(r)])),
  };
  if (input.prefs) {
    file.ui = uiFromPrefs(input.prefs);
    const loc = input.prefs.location;
    file.here = loc ? { label: loc.label, ...(loc.lat !== undefined ? { lat: loc.lat, lng: loc.lng } : {}) } : null;
  }
  if (input.kinds) file.kinds = input.kinds.map((k) => ({ name: k.name, hue: k.hue }));
  return file;
}

/** `orbit-export-YYYY-MM-DD.json`, in local time, as Orbit today names it. */
export function exportFileName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `orbit-export-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}
