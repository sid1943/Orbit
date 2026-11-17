import { STATUSES, type Item } from "@orbit/core";

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

const REVIEW_DECISIONS = ["yes", "no", "none", "alt", "fix", "hide"];

export function isReviewDecision(v: unknown): boolean {
  return typeof v === "object" && v !== null && REVIEW_DECISIONS.includes(String((v as { d?: unknown }).d));
}

/** Comma-separated ids from a query string, capped to stay under D1's 100 bound parameters. */
export function idList(q: string | undefined, max = 90): string[] {
  return (q ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}
