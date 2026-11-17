import { countByKind as countKinds, type KindCount as Count, type KindInfo } from "@orbit/core";

/**
 * Kind order, counts and slugs now live in core (`packages/core/src/kinds.ts`) so custom kinds work
 * everywhere. Pass the list from `useKinds()`; without it only the standard kinds are known.
 */
export { countByKind, kindFromSlug, kindSlug, type KindCount } from "@orbit/core";

/**
 * The kind tiles: standard kinds that have cards, and every kind Sid added (even at 0, so a new one
 * shows straight away), in list order.
 */
export function kindTiles(
  items: readonly { kind: string; archived: boolean; deleted: boolean }[],
  kinds: readonly KindInfo[],
): Count[] {
  const standard = new Set(kinds.filter((k) => k.standard).map((k) => k.name));
  return countKinds(items, kinds, { withEmpty: true }).filter((c) => c.count > 0 || !standard.has(c.kind));
}
