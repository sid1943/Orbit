import { matcher, type SyncItem } from "@orbit/core";

/** The text a card is found by besides its title: kind, topics and details. */
const otherText = (i: SyncItem) => [i.kind, ...i.tags, ...Object.values(i.props)].join(" · ");

/**
 * Cards matching a search, ranked like the first Orbit: title matches first, then cards that match on
 * their topics or details. Within a rank the list keeps the order it was given in.
 */
export function searchItems(items: readonly SyncItem[], q: string): SyncItem[] {
  if (!q.trim()) return [];
  const m = matcher(q);
  const title: SyncItem[] = [],
    other: SyncItem[] = [];
  for (const i of items) {
    if (m(i.title)) title.push(i);
    else if (m(`${i.title} · ${otherText(i)}`)) other.push(i);
  }
  return [...title, ...other];
}

/** The palette's quick list: cards whose title matches, shorter titles first, at most `n`. */
export function quickMatches(items: readonly SyncItem[], q: string, n = 8): SyncItem[] {
  if (!q.trim()) return [];
  const m = matcher(q);
  return items
    .filter((i) => m(i.title))
    .sort((a, b) => a.title.length - b.title.length || a.title.localeCompare(b.title))
    .slice(0, n);
}
