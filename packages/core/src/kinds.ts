import { KIND_HUES } from "./prefs.js";
import { KINDS } from "./types.js";

/**
 * Kinds: the 13 standard ones are built in and always come first, in `KINDS` order. Sid can add his
 * own (custom kinds) after them, each with a name and a hue, in an order he chooses. Custom kinds are
 * stored as the `kinds` row of the `prefs` table (see docs/DATA-MODEL.md) and change only through
 * `/api/kinds`, which checks names and moves cards on a rename.
 */

/** A kind Sid added: its name and hue (0–360). Its place in the list is its order. */
export interface CustomKind {
  name: string;
  hue: number;
}

/** One kind in the ordered list. */
export interface KindInfo {
  name: string;
  hue: number;
  /** Position in the list, from 0. */
  order: number;
  /** Built in: can't be renamed, recoloured, moved or deleted. */
  standard: boolean;
}

/** The longest kind name accepted. */
export const KIND_NAME_MAX = 40;

/** URL-safe kind name for `/kind/:kind` ("To-do" → "to-do"). */
export const kindSlug = (kind: string): string =>
  kind
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const clampHue = (h: number): number => ((Math.round(h) % 360) + 360) % 360;

/** Reads the stored custom kinds, dropping anything malformed, duplicated or clashing with a standard kind. */
export function parseCustomKinds(raw: unknown): CustomKind[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>(KINDS.map(kindSlug));
  const out: CustomKind[] = [];
  for (const k of raw) {
    if (typeof k !== "object" || k === null) continue;
    const { name, hue } = k as Record<string, unknown>;
    if (typeof name !== "string" || typeof hue !== "number" || !Number.isFinite(hue)) continue;
    const n = name.trim();
    const slug = kindSlug(n);
    if (!n || !slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ name: n, hue: clampHue(hue) });
  }
  return out;
}

/** Every kind in order: the standard ones, then Sid's own. */
export function kindList(custom: readonly CustomKind[] = []): KindInfo[] {
  return [
    ...KINDS.map((name, order) => ({ name, hue: KIND_HUES[name], order, standard: true })),
    ...custom.map((k, i) => ({ name: k.name, hue: k.hue, order: KINDS.length + i, standard: false })),
  ];
}

/** The kind a name stands for, ignoring capitals. */
export function findKind(name: string, kinds: readonly KindInfo[] = kindList()): KindInfo | undefined {
  const slug = kindSlug(name.trim());
  return slug ? kinds.find((k) => kindSlug(k.name) === slug) : undefined;
}

/** The kind a `/kind/:kind` slug stands for, standard or custom. */
export const kindFromSlug = (slug: string, kinds: readonly KindInfo[] = kindList()): string | undefined =>
  kinds.find((k) => kindSlug(k.name) === slug)?.name;

/**
 * Why a name can't be used for a new kind (or for renaming `current`), or null when it can.
 * Names are compared by their slug, so "zine", "Zine" and "Zine!" are the same kind.
 */
export function kindNameProblem(name: unknown, kinds: readonly KindInfo[], current?: string): string | null {
  if (typeof name !== "string" || !name.trim()) return "a kind needs a name";
  const n = name.trim();
  if (n.length > KIND_NAME_MAX) return `a kind's name can be at most ${KIND_NAME_MAX} characters`;
  if (!kindSlug(n)) return "a kind's name needs at least one letter or number";
  const same = findKind(n, kinds);
  if (same && (!current || kindSlug(same.name) !== kindSlug(current)))
    return `there is already a kind called ${same.name}`;
  return null;
}

/** A hue far from the ones in use, for a new kind's starting colour. */
export function suggestHue(kinds: readonly { hue: number }[]): number {
  let best = 0,
    bestGap = -1;
  for (let h = 0; h < 360; h += 5) {
    const gap = Math.min(...kinds.map((k) => Math.min(Math.abs(k.hue - h), 360 - Math.abs(k.hue - h))), 180);
    if (gap > bestGap) {
      best = h;
      bestGap = gap;
    }
  }
  return best;
}

export interface KindCount {
  kind: string;
  count: number;
}

/**
 * Kinds in list order with how many live cards each has. Kinds not in the list go last.
 * Empty kinds are left out unless `withEmpty` is set (then every listed kind is there, even at 0).
 */
export function countByKind(
  items: readonly { kind: string; archived: boolean; deleted: boolean }[],
  kinds: readonly KindInfo[] = kindList(),
  opts: { withEmpty?: boolean } = {},
): KindCount[] {
  const counts = new Map<string, number>();
  if (opts.withEmpty) for (const k of kinds) counts.set(k.name, 0);
  for (const it of items) if (!it.deleted && !it.archived) counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1);
  const order = new Map<string, number>(kinds.map((k) => [k.name, k.order]));
  return [...counts]
    .map(([kind, count]) => ({ kind, count }))
    .sort(
      (a, b) =>
        (order.get(a.kind) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.kind) ?? Number.MAX_SAFE_INTEGER) ||
        a.kind.localeCompare(b.kind),
    );
}

/** Applies a new order to the custom kinds. `names` must name each custom kind once; returns null otherwise. */
export function reorderKinds(custom: readonly CustomKind[], names: readonly string[]): CustomKind[] | null {
  if (names.length !== custom.length) return null;
  const bySlug = new Map(custom.map((k) => [kindSlug(k.name), k]));
  const out: CustomKind[] = [];
  for (const n of names) {
    const k = typeof n === "string" ? bySlug.get(kindSlug(n)) : undefined;
    if (!k) return null;
    bySlug.delete(kindSlug(n));
    out.push(k);
  }
  return out;
}
