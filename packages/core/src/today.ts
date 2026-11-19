import type { Status } from "./types.js";

/**
 * Rules behind the Today page and the lists, the same ones the first Orbit used:
 * when a dated thing happens next, what is in season, the daily picks, the topic cloud and distances.
 * Dates are local calendar days; pass `now` so tests (and the caller) decide what "today" is.
 */

export const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

/** The detail that says when something happens, e.g. "First Saturday in May" or "Fall". */
export const WHEN_PROP = "Preferable Time";

const monthIndex = (w: string): number => {
  w = w.toLowerCase().replace(/[^a-z]/g, "");
  if (w === "feburary") return 1;
  if (w.length < 3) return -1;
  return MONTHS.findIndex((m) => m.startsWith(w) || w.startsWith(m));
};

/** Months (0–11) a free-text time covers: "May–July", "spring", "year-round", "Thanksgiving"… */
export function monthsOf(text: string): Set<number> {
  const t = text.toLowerCase();
  const out = new Set<number>();
  if (/anytime|year[- ]round|all year/.test(t)) {
    for (let i = 0; i < 12; i++) out.add(i);
    return out;
  }
  const range = /([a-z]+)\s*(?:-|–|—|\bto\b|\bthrough\b|\bthru\b|\buntil\b)\s*(?:late |early |mid[- ]?)?([a-z]+)/g;
  for (const m of t.matchAll(range)) {
    const a = monthIndex(m[1] ?? ""),
      b = monthIndex(m[2] ?? "");
    if (a < 0 || b < 0) continue;
    for (let i = a, k = 0; k < 12; i = (i + 1) % 12, k++) {
      out.add(i);
      if (i === b) break;
    }
  }
  for (const w of t.split(/[^a-z]+/)) {
    if (w.length < 3) continue;
    const i = MONTHS.findIndex((m) => m === w || m.slice(0, 3) === w || (w === "feburary" && m === "february"));
    if (i >= 0) out.add(i);
  }
  const add = (...ms: number[]) => ms.forEach((m) => out.add(m));
  if (/thanksgiving/.test(t)) add(10);
  if (/memorial/.test(t)) add(4);
  if (/christmas/.test(t)) add(11);
  if (/new year/.test(t)) add(11, 0);
  if (/derby day/.test(t)) add(5);
  if (/spring/.test(t)) add(2, 3, 4);
  if (/summer/.test(t)) add(5, 6, 7);
  if (/\bfall\b|autumn/.test(t)) add(8, 9, 10);
  if (/winter/.test(t)) add(11, 0, 1);
  return out;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const ORDINALS: Record<string, number> = {
  first: 1,
  "1st": 1,
  second: 2,
  "2nd": 2,
  third: 3,
  "3rd": 3,
  fourth: 4,
  "4th": 4,
  fifth: 5,
  "5th": 5,
  last: -1,
};
const MONTH_RE = "(january|february|feburary|march|april|may|june|july|august|september|october|november|december)";

/** The nth weekday of a month (n = -1 for the last one), or null if the month has no such day. */
function nthWeekday(y: number, m: number, wd: number, n: number): Date | null {
  if (n > 0) {
    const off = (wd - new Date(y, m, 1).getDay() + 7) % 7;
    const d = new Date(y, m, 1 + off + (n - 1) * 7);
    return d.getMonth() === m ? d : null;
  }
  const last = new Date(y, m + 1, 0);
  return new Date(y, m, last.getDate() - ((last.getDay() - wd + 7) % 7));
}

/** The date a rule like "3rd Saturday of June" or "July 4" falls on in year `y`. */
function ruleDate(text: string, y: number): Date | null {
  const t = text.toLowerCase();
  let m: RegExpMatchArray | null;
  if (/new year/.test(t)) return new Date(y, 11, 31);
  if (/saturday after thanksgiving/.test(t)) {
    const th = nthWeekday(y, 10, 4, 4)!;
    return new Date(y, 10, th.getDate() + 2);
  }
  if (/memorial/.test(t)) {
    const md = nthWeekday(y, 4, 1, -1)!;
    return new Date(y, 4, md.getDate() - 1);
  }
  if (/after derby day/.test(t)) {
    const derby = nthWeekday(y, 4, 6, 1)!;
    const k = /(first|second|third|fourth|fifth)/.exec(t)?.[1];
    return new Date(y, 4, derby.getDate() + 7 * (k ? (ORDINALS[k] ?? 5) : 5));
  }
  if (
    (m = t.match(
      new RegExp(
        `(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|last)\\s+(${WEEKDAYS.join("|")})\\s+(?:in|of)\\s+${MONTH_RE}`,
      ),
    ))
  )
    return nthWeekday(y, monthIndex(m[3]!), WEEKDAYS.indexOf(m[2]!), ORDINALS[m[1]!]!);
  if ((m = t.match(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:[-–]\\s*\\d{1,2}\\s*)?${MONTH_RE}`))))
    return new Date(y, monthIndex(m[2]!), +m[1]!);
  if ((m = t.match(new RegExp(`${MONTH_RE}\\s+(\\d{1,2})(?!\\d)`)))) return new Date(y, monthIndex(m[1]!), +m[2]!);
  return null;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** The next date (today or later) a rule falls on, this year or next. */
export function nextDate(text: string, now = new Date()): Date | null {
  const today = startOfDay(now);
  for (const y of [now.getFullYear(), now.getFullYear() + 1]) {
    const d = ruleDate(text, y);
    if (d && d >= today) return d;
  }
  return null;
}

/** Whole days from today to `d` (0 = today). */
export const daysUntil = (d: Date, now = new Date()): number =>
  Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 864e5);

export interface TimeInfo {
  /** The card's own words, e.g. "First Saturday in May". */
  text: string;
  months: Set<number>;
  next: Date | null;
}

/** When a card happens, from its "Preferable Time" detail; null when it has none. */
export function timeInfo(card: { props: Record<string, string> }, now = new Date()): TimeInfo | null {
  const text = card.props[WHEN_PROP]?.trim() ?? "";
  if (!text || /^changes$/i.test(text)) return null;
  return { text, months: monthsOf(text), next: nextDate(text, now) };
}

/** True when the card names some months (not all) and this month is one of them. */
export const inSeason = (ti: TimeInfo | null, now = new Date()): boolean =>
  !!ti && ti.months.size > 0 && ti.months.size < 12 && ti.months.has(now.getMonth());

/**
 * In season and with no exact day: what "In season" lists. A card with an exact day ("Saturday after Thanksgiving")
 * belongs to "Coming up" instead, so the two never show the same card.
 */
export const inSeasonOnly = (ti: TimeInfo | null, now = new Date()): boolean => inSeason(ti, now) && !ti!.next;

/** "today", "tomorrow" or "in 12 days". */
export const relativeDays = (n: number): string => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

const STATUS_RANK: Record<Status, number> = { doing: 0, todo: 1, done: 2, dropped: 3 };

/** List order: doing, to do, done, dropped; then most recently changed; then by title. */
export function byStatusThenRecent<T extends { status: Status; updatedAt: number; title: string }>(a: T, b: T): number {
  return STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.updatedAt - a.updatedAt || a.title.localeCompare(b.title);
}

/** `n` items picked from `items`, the same ones all day and different the next day. */
export function dailyPick<T>(items: readonly T[], n: number, now = new Date()): T[] {
  const pool = [...items];
  const out: T[] = [];
  let s = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  while (pool.length && out.length < n) {
    s = (s * 9301 + 49297) % 233280;
    out.push(pool.splice(s % pool.length, 1)[0]!);
  }
  return out;
}

/** Cards with long checklists (8+ rows) that are partly done, most finished first. */
export function closestToFinished<T extends { done: number; total: number }>(items: readonly T[], n = 9): T[] {
  return items
    .filter((i) => i.total >= 8 && i.done < i.total)
    .sort((a, b) => b.done / b.total - a.done / a.total || b.total - a.total)
    .slice(0, n);
}

export interface TopicCount {
  /** The topic as most cards spell it. */
  name: string;
  /** Lowercase key, for `/topic/:name`. */
  key: string;
  count: number;
}

/** Topics across cards, biggest first. Spelling differences in case are one topic. */
export function topicCounts(items: readonly { tags: string[] }[]): TopicCount[] {
  const map = new Map<string, { names: Map<string, number>; count: number }>();
  for (const it of items) {
    const seen = new Set<string>();
    for (const t of it.tags) {
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const e = map.get(key) ?? { names: new Map(), count: 0 };
      e.count++;
      e.names.set(t, (e.names.get(t) ?? 0) + 1);
      map.set(key, e);
    }
  }
  return [...map]
    .map(([key, e]) => ({ key, count: e.count, name: [...e.names].sort((a, b) => b[1] - a[1])[0]![0] }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Miles between two points (great-circle). */
export function distanceMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad,
    dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "0.4 mi", "12 mi", "1,240 mi". */
export const formatMiles = (mi: number): string =>
  mi < 1 ? `${mi.toFixed(1)} mi` : `${Math.round(mi).toLocaleString("en-US")} mi`;

/** What each status is called in lists and filters. */
export const STATUS_LABELS: Record<Status, string> = {
  todo: "To do",
  doing: "Doing",
  done: "Done",
  dropped: "Dropped",
};

/** The status a row's check box moves to: to do → doing → done → to do (dropped starts over). */
export const nextStatus = (s: Status): Status => (s === "todo" ? "doing" : s === "doing" ? "done" : "todo");

/** A typed to-do: "Renew passport #Travel" → title "Renew passport", quest "Travel" (default "Other"). */
export function parseTodo(text: string): { title: string; quest: string } | null {
  let quest = "";
  const title = text
    .replace(/#([^#]+?)(?=\s+#|$)/, (_m, q: string) => {
      quest = q.trim();
      return "";
    })
    .trim();
  return title ? { title, quest: quest || "Other" } : null;
}
