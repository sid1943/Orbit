import type { Checklist, Confidence, Entity, Item, Review, ReviewDecision, Status } from "./types.js";
import { STATUSES } from "./types.js";

/**
 * Converts the file made by "Download everything" in the original Orbit page
 * (format "orbit-export", version 1) into Orbit's data model.
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

export interface OrbitExportV1 {
  format: "orbit-export";
  version: 1;
  exported: string;
  items: RawItem[];
  ent: Record<string, RawEntity>;
  reviews: Record<string, RawDecision>;
}

export interface ImportResult {
  items: Item[];
  entities: Entity[];
  reviews: Review[];
}

const KIND_RENAMES: Record<string, string> = { Goal: "To-do", Health: "To-do" };
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export function mapEntity(id: string, r: RawEntity, now: number): Entity {
  const e: Entity = {
    id,
    name: str(r.n) ?? id,
    category: str(r.cat) ?? "card",
    confidence: (str(r.conf) ?? "none") as Confidence,
    updatedAt: num(r.updatedAt) ?? now,
  };
  const put = <K extends keyof Entity>(k: K, v: Entity[K] | undefined) => {
    if (v !== undefined) e[k] = v;
  };
  put("qid", str(r.q));
  put("label", str(r.label));
  put("description", str(r.d));
  put("imdb", str(r.imdb));
  put("igdb", str(r.igdb));
  put("openLibrary", str(r.ol));
  put("author", str(r.author));
  put("year", num(r.yr));
  put("wikipedia", str(r.wp));
  put("website", str(r.web));
  put("unesco", str(r.un));
  put("steam", str(r.steam));
  put("lat", num(r.lat));
  put("lng", num(r.lng));
  put("location", str(r.loc));
  put("mapQuery", str(r.mq));
  put("closed", str(r.closed));
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
  return { items, entities, reviews };
}
