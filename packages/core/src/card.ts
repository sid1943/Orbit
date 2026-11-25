import { entityLinks } from "./links.js";
import { hiddenKey, hiddenUrls } from "./review.js";
import { matcher, readableLink, slug } from "./text.js";
import type { Checklist, ChecklistRow, Comment, Entity, Item, Review } from "./types.js";

/**
 * Rules for one opened card (the card panel): its links, notes text, checklists, comments and
 * topics. Every edit returns new values, so callers can save them and undo on failure.
 */

/** A link as the card shows it: a readable name, the site, and an optional note. */
export interface ShownLink {
  label: string;
  url: string;
  host: string;
  note?: string;
  /** Set when the link opens another Orbit card (an old Trello card link that maps to one). */
  cardId?: string;
}

/** An Orbit card a link points at. */
export interface CardRef {
  id: string;
  title: string;
}

/** Finds the Orbit card behind an old Trello card link, or null. */
export type CardForUrl = (url: string) => CardRef | null;

/** True for any trello.com address. Trello is gone, so these are never shown as links. */
export function isTrelloUrl(url: string): boolean {
  try {
    return /(^|\.)trello\.com$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** The short id and title slug in an old Trello card link (`trello.com/c/<id>/<n>-<slug>`), or null. */
export function trelloCardParts(url: string): { shortId: string; slug: string } | null {
  const m = /^https?:\/\/(?:www\.)?trello\.com\/c\/([A-Za-z0-9]+)(?:\/([^/?#]*))?/i.exec(url);
  if (!m) return null;
  return {
    shortId: m[1]!,
    slug: decodeURIComponent(m[2] ?? "")
      .toLowerCase()
      .replace(/^\d+-/, ""),
  };
}

/**
 * Builds the lookup for old Trello card links: by the card's id (imported cards keep their Trello
 * short id), else by its title (Orbit today's rule).
 */
export function trelloCardFinder(cards: readonly { id: string; title: string; deleted?: boolean }[]): CardForUrl {
  const byId = new Map<string, CardRef>();
  const bySlug = new Map<string, CardRef>();
  for (const c of cards) {
    if (c.deleted) continue;
    const ref = { id: c.id, title: c.title };
    byId.set(c.id, ref);
    if (!bySlug.has(slug(c.title))) bySlug.set(slug(c.title), ref);
  }
  return (url) => {
    const p = trelloCardParts(url);
    if (!p) return null;
    return byId.get(p.shortId) ?? (p.slug ? (bySlug.get(p.slug) ?? null) : null);
  };
}

/** "Title #topic one #two" → the title and its topics (a topic runs to the next # or the end). */
export function splitTopics(input: string): { title: string; tags: string[] } {
  const tags: string[] = [];
  const title = input
    .replace(/#([^#]+?)(?=\s+#|$)/g, (_m, t: string) => {
      tags.push(t.trim());
      return "";
    })
    .replace(/\s+/g, " ")
    .trim();
  return { title, tags: [...new Set(tags.filter(Boolean))] };
}

/** The links Sid hid on a thing or card (its `x:` answer among `reviews`). */
export function hiddenFor(reviews: readonly Review[], key: string): Set<string> {
  return hiddenUrls(reviews.find((r) => r.entityId === hiddenKey(key))?.decision);
}

/** A linked thing's links: the standard ones plus any Sid pasted in "Fix links", minus hidden ones. */
export function thingLinks(e: Entity, hidden: ReadonlySet<string> = new Set()): ShownLink[] {
  const out: ShownLink[] = [];
  const seen = new Set<string>();
  for (const l of [...entityLinks(e), ...(e.userLinks ?? [])]) {
    if (seen.has(l.url) || hidden.has(l.url)) continue;
    seen.add(l.url);
    out.push({ label: l.label, url: l.url, host: readableLink(l.url).host });
  }
  return out;
}

const URL_RE = /https?:\/\/[^\s)\]"<>]+/g;

/**
 * Useful links: the card's standard links first (from its linked thing), then the links and
 * attachments that came with the card. All named readably, no repeats, hidden ones left out.
 * A standard link already written in the notes isn't repeated here.
 */
export function usefulLinks(
  item: Pick<Item, "id" | "links" | "attachments" | "notes">,
  thing: Entity | null,
  hidden: ReadonlySet<string> = new Set(),
  cardForUrl: CardForUrl = () => null,
): ShownLink[] {
  const out: ShownLink[] = [];
  const seen = new Set<string>();
  const add = (l: ShownLink) => {
    const key = l.cardId ? `card:${l.cardId}` : l.url;
    if (seen.has(key) || hidden.has(l.url)) return;
    seen.add(key);
    out.push(l);
  };
  if (thing) {
    const inNotes = new Set(item.notes.match(URL_RE) ?? []);
    for (const l of thingLinks(thing, hidden)) {
      if (inNotes.has(l.url)) continue;
      const note =
        l.label === "Wikipedia"
          ? thing.description
          : l.label === "Map" || l.label === "Find nearby"
            ? thing.location
            : "";
      add(note ? { ...l, note } : l);
    }
  }
  for (const l of [...item.links, ...item.attachments]) {
    // Trello is gone: a Trello card link opens the Orbit card it became; anything else from Trello is dropped.
    if (isTrelloUrl(l.url)) {
      const card = cardForUrl(l.url);
      if (card && card.id !== item.id)
        add({ label: card.title, url: `/item/${encodeURIComponent(card.id)}`, host: "Orbit", cardId: card.id });
      continue;
    }
    const r = readableLink(l.url, l.label);
    add(
      l.note
        ? { label: r.label, url: l.url, host: r.host, note: l.note }
        : { label: r.label, url: l.url, host: r.host },
    );
  }
  return out;
}

/** A piece of notes or comment text: plain, a web link (readably named) or a [[card title]] link. */
export type TextPart =
  | { t: "text"; text: string }
  | { t: "bold"; text: string }
  | { t: "url"; url: string; label: string }
  | { t: "card"; title: string; id: string | null };

/**
 * Splits text for showing: Markdown links `[name](url)`, bare addresses, `[[Exact title]]` links to
 * other cards (looked up with `findCard`), and `**bold**`. Addresses never show raw. Old Trello card
 * links open the Orbit card they became (`cardForUrl`); other Trello links are dropped (a Markdown
 * link keeps its name as plain text).
 */
export function textParts(
  text: string,
  findCard: (title: string) => string | null = () => null,
  cardForUrl: CardForUrl = () => null,
): TextPart[] {
  const re = /\[([^\]]+)\]\((https?:[^)\s]+)(?:\s+"[^"]*")?\)|\[\[([^\]]+)\]\]|(https?:\/\/[^\s<)]+)|\*\*([^*]+)\*\*/g;
  const out: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index;
    if (at > last) out.push({ t: "text", text: text.slice(last, at) });
    const trello = (url: string, name?: string) => {
      const card = cardForUrl(url);
      if (card) out.push({ t: "card", title: card.title, id: card.id });
      else if (name) out.push({ t: "text", text: name });
    };
    if (m[2]) {
      if (isTrelloUrl(m[2])) trello(m[2], m[1]);
      else out.push({ t: "url", url: m[2], label: readableLink(m[2], m[1]).label });
    } else if (m[3]) out.push({ t: "card", title: m[3], id: findCard(m[3]) });
    else if (m[4]) {
      // A sentence's closing punctuation isn't part of the address.
      const url = m[4].replace(/[.,;:!?'"]+$/, "");
      if (isTrelloUrl(url)) trello(url);
      else out.push({ t: "url", url, label: readableLink(url).label });
      if (url.length < m[4].length) out.push({ t: "text", text: m[4].slice(url.length) });
    } else if (m[5]) out.push({ t: "bold", text: m[5] });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ t: "text", text: text.slice(last) });
  return out;
}

/**
 * Which rows of each checklist match a search (the same rule as search everywhere), also looking
 * at the row's linked thing's title and author. `null` when the search is empty.
 */
export function checklistMatches(
  lists: readonly Checklist[],
  q: string,
  thingOf: (row: ChecklistRow) => Entity | null = () => null,
): number[][] | null {
  if (!q.trim()) return null;
  const test = matcher(q);
  return lists.map((c) =>
    c.rows.flatMap((r, i) => {
      const e = thingOf(r);
      const text = [r.text, e?.label, e?.author].filter(Boolean).join(" ");
      return test(text) ? [i] : [];
    }),
  );
}

const withList = (lists: readonly Checklist[], ci: number, fn: (rows: ChecklistRow[]) => ChecklistRow[]): Checklist[] =>
  lists.map((c, i) => (i === ci ? { ...c, rows: fn([...c.rows]) } : c));

export const toggleRow = (lists: readonly Checklist[], ci: number, ri: number): Checklist[] =>
  withList(lists, ci, (rows) => rows.map((r, i) => (i === ri ? { ...r, done: !r.done } : r)));

export function addRow(lists: readonly Checklist[], ci: number, text: string): Checklist[] {
  const t = text.trim();
  return t ? withList(lists, ci, (rows) => [...rows, { text: t, done: false }]) : [...lists];
}

/** New text for a row. Its linked thing stays with it. Empty text changes nothing. */
export function editRow(lists: readonly Checklist[], ci: number, ri: number, text: string): Checklist[] {
  const t = text.trim();
  return t ? withList(lists, ci, (rows) => rows.map((r, i) => (i === ri ? { ...r, text: t } : r))) : [...lists];
}

export const deleteRow = (lists: readonly Checklist[], ci: number, ri: number): Checklist[] =>
  withList(lists, ci, (rows) => rows.filter((_r, i) => i !== ri));

/** Moves a row up (-1) or down (+1) within its checklist. */
export function moveRow(lists: readonly Checklist[], ci: number, ri: number, by: -1 | 1): Checklist[] {
  const to = ri + by;
  return withList(lists, ci, (rows) => {
    if (to < 0 || to >= rows.length) return rows;
    [rows[ri], rows[to]] = [rows[to]!, rows[ri]!];
    return rows;
  });
}

/** Moves a row to the end of another checklist. */
export function moveRowTo(lists: readonly Checklist[], ci: number, ri: number, toCi: number): Checklist[] {
  const row = lists[ci]?.rows[ri];
  if (!row || toCi === ci || !lists[toCi]) return [...lists];
  return withList(deleteRow(lists, ci, ri), toCi, (rows) => [...rows, row]);
}

export function addChecklist(lists: readonly Checklist[], name: string): Checklist[] {
  const n = name.trim();
  return n ? [...lists, { name: n, rows: [] }] : [...lists];
}

export function renameChecklist(lists: readonly Checklist[], ci: number, name: string): Checklist[] {
  const n = name.trim();
  return n ? lists.map((c, i) => (i === ci ? { ...c, name: n } : c)) : [...lists];
}

export const deleteChecklist = (lists: readonly Checklist[], ci: number): Checklist[] =>
  lists.filter((_c, i) => i !== ci);

/** Today as YYYY-MM-DD in local time. */
export const localDay = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Adds a comment at the end, dated today (as Orbit today did). */
export function addComment(comments: readonly Comment[], text: string, now = new Date()): Comment[] {
  const t = text.trim();
  return t ? [...comments, { date: localDay(now), text: t }] : [...comments];
}

export const deleteComment = (comments: readonly Comment[], i: number): Comment[] =>
  comments.filter((_c, j) => j !== i);

/** Adds topics (one, or several written as "#a #b"), skipping ones the card has in any case. */
export function addTopics(tags: readonly string[], input: string): string[] {
  const raw = input.includes("#") ? splitTopics(input).tags : [input.trim()];
  const have = new Set(tags.map((t) => t.toLowerCase()));
  const out = [...tags];
  for (const t of raw.map((x) => x.replace(/^#/, "").trim()).filter(Boolean)) {
    if (have.has(t.toLowerCase())) continue;
    have.add(t.toLowerCase());
    out.push(t);
  }
  return out;
}

export const removeTopic = (tags: readonly string[], t: string): string[] =>
  tags.filter((x) => x.toLowerCase() !== t.toLowerCase());

/** The cards this one points at: its refs and its notes' [[Exact title]] links, found with `findCard`. */
export function linkedCardIds(
  item: Pick<Item, "id" | "refs" | "notes">,
  findCard: (title: string) => string | null,
): string[] {
  const ids = [...item.refs];
  for (const m of item.notes.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const id = findCard(m[1]!);
    if (id) ids.push(id);
  }
  return [...new Set(ids)].filter((id) => id !== item.id);
}

/**
 * Cards that share topics with this one, best first (Orbit today's rule): a shared topic counts
 * for more when few cards have it, and ties go to cards of the same kind.
 */
export function relatedByTopics<T extends { id: string; kind: string; tags: string[] }>(
  card: { id: string; kind: string; tags: string[] },
  cards: readonly T[],
  limit = 14,
): { card: T; topics: string[] }[] {
  const mine = new Set(card.tags.map((t) => t.toLowerCase()));
  if (!mine.size) return [];
  const count = new Map<string, number>();
  for (const c of cards)
    for (const t of new Set(c.tags.map((x) => x.toLowerCase()))) count.set(t, (count.get(t) ?? 0) + 1);
  const scored: { card: T; topics: string[]; score: number }[] = [];
  for (const c of cards) {
    if (c.id === card.id) continue;
    const shared = c.tags.filter((t) => mine.has(t.toLowerCase()));
    if (!shared.length) continue;
    const score = shared.reduce((s, t) => s + 1 / Math.log2(2 + (count.get(t.toLowerCase()) ?? 1)), 0);
    scored.push({ card: c, topics: shared, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || Number(a.card.kind !== card.kind) - Number(b.card.kind !== card.kind))
    .slice(0, limit)
    .map(({ card: c, topics }) => ({ card: c, topics }));
}
