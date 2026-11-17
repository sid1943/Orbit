/**
 * Kind order, counts and slugs now live in core (`packages/core/src/kinds.ts`) so custom kinds work
 * everywhere. Pass the list from `useKinds()`; without it only the standard kinds are known.
 */
export { countByKind, kindFromSlug, kindSlug, type KindCount } from "@orbit/core";
