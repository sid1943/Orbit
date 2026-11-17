import { ENTITY_FIELDS, STATUSES, type Entity, type Item, type ReviewDecision } from "@orbit/core";

/** Fields a client may set on a card. Everything else (id, source, timestamps) is managed by the API. */
export const EDITABLE_ITEM_FIELDS = [
  "kind",
  "title",
  "status",
  "tags",
  "props",
  "notes",
  "due",
  "start",
  "archived",
  "deleted",
  "entityId",
  "refs",
  "links",
  "attachments",
  "comments",
  "checklists",
  "coverId",
] as const;

export type ItemFields = Partial<Pick<Item, (typeof EDITABLE_ITEM_FIELDS)[number]>>;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Keeps only editable fields and checks the ones with rules. */
export function parseItemFields(body: Record<string, unknown>): Parsed<ItemFields> {
  const out: Record<string, unknown> = {};
  for (const k of EDITABLE_ITEM_FIELDS) if (k in body) out[k] = body[k];
  if ("title" in out && (typeof out.title !== "string" || !out.title.trim())) {
    return { ok: false, error: "title must be a non-empty string" };
  }
  if ("kind" in out && (typeof out.kind !== "string" || !out.kind.trim())) {
    return { ok: false, error: "kind must be a non-empty string" };
  }
  if ("status" in out && !(STATUSES as readonly unknown[]).includes(out.status)) {
    return { ok: false, error: `status must be one of ${STATUSES.join(", ")}` };
  }
  if ("due" in out && out.due !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(out.due))) {
    return { ok: false, error: "due must be YYYY-MM-DD or null" };
  }
  return { ok: true, value: out as ItemFields };
}

const str = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** Checks an answer to a link guess (`PUT /api/reviews/:key`). */
export function parseReviewDecision(v: unknown): Parsed<ReviewDecision> {
  const bad = (error: string): Parsed<ReviewDecision> => ({ ok: false, error });
  if (typeof v !== "object" || v === null) return bad("send a decision object");
  const o = v as Record<string, unknown>;
  switch (o.d) {
    case "yes":
    case "no":
    case "none":
      return { ok: true, value: { d: o.d } };
    case "alt":
      if (!str(o.qid)) return bad("alt needs qid");
      return { ok: true, value: { d: "alt", qid: o.qid, ...(str(o.label) ? { label: o.label } : {}) } };
    case "fix":
      if (!str(o.url) && !str(o.text)) return bad("fix needs url or text");
      return {
        ok: true,
        value: {
          d: "fix",
          ...(str(o.url) ? { url: o.url } : {}),
          ...(str(o.text) ? { text: o.text } : {}),
          add: !!o.add,
        },
      };
    case "hide":
      if (!Array.isArray(o.urls) || !o.urls.every(str)) return bad("hide needs urls (a list of addresses)");
      return { ok: true, value: { d: "hide", urls: o.urls } };
    default:
      return bad("decision must have d: yes|no|none|alt|fix|hide");
  }
}

const CONFIDENCES = ["high", "review", "none", "map", "nolink", "user", "rejected"];

/** Fields a client may change on a linked thing. Its id and timestamp are managed by the API. */
export function parseEntityFields(body: unknown): Parsed<Partial<Entity>> {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, error: "send JSON" };
  const b = body as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of ["name", "category"] as const) {
    if (!(k in b)) continue;
    if (!str(b[k])) return { ok: false, error: `${k} must be a non-empty string` };
    out[k] = b[k];
  }
  if ("confidence" in b) {
    if (!CONFIDENCES.includes(String(b.confidence)))
      return { ok: false, error: `confidence must be one of ${CONFIDENCES.join(", ")}` };
    out.confidence = b.confidence;
  }
  for (const [field, , type] of ENTITY_FIELDS) {
    if (!(field in b)) continue;
    const v = b[field];
    // null clears a field.
    if (v === null) out[field] = undefined;
    else if (type === "n" ? typeof v === "number" && Number.isFinite(v) : typeof v === "string") out[field] = v;
    else return { ok: false, error: `${field} must be a ${type === "n" ? "number" : "string"} or null` };
  }
  return { ok: true, value: out as Partial<Entity> };
}

/** A whole number from a query string, or the fallback. */
export function intParam(q: string | undefined, fallback: number): number {
  const n = Number(q);
  return q !== undefined && q !== "" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** Most ids one request may ask for. They go to the database as one JSON list, so D1's 100-parameter limit doesn't apply. */
export const MAX_IDS = 2000;

/** Comma-separated ids from a query string. More than `MAX_IDS` is an error rather than a silent cut. */
export function idList(q: string | undefined): Parsed<string[]> {
  const ids = [
    ...new Set(
      (q ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  return ids.length > MAX_IDS
    ? { ok: false, error: `ask for at most ${MAX_IDS} ids at a time` }
    : { ok: true, value: ids };
}
