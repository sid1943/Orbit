import { KINDS } from "@orbit/core";

export interface KindCount {
  kind: string;
  count: number;
}

/** Kinds in their standard order with how many live cards each has; unknown kinds go last, empty ones are left out. */
export function countByKind(items: readonly { kind: string; archived: boolean; deleted: boolean }[]): KindCount[] {
  const counts = new Map<string, number>();
  for (const it of items) if (!it.deleted && !it.archived) counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1);
  const order = new Map<string, number>(KINDS.map((k, i) => [k, i]));
  return [...counts]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => (order.get(a.kind) ?? 99) - (order.get(b.kind) ?? 99) || a.kind.localeCompare(b.kind));
}

/** URL-safe kind name for `/kind/:kind` ("To-do" → "to-do"). */
export const kindSlug = (kind: string) =>
  kind
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** The kind a slug stands for, if it is one of the standard kinds. */
export const kindFromSlug = (slug: string) => KINDS.find((k) => kindSlug(k) === slug);
