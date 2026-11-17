/**
 * Settings Sid keeps across devices (stored by key through `PUT /api/prefs/:key`),
 * plus the small display rules every app shares: the greeting and the kind colours.
 */

import { type AppearancePref, DEFAULT_APPEARANCE, parseAppearance } from "./appearance.js";
import type { Kind } from "./types.js";

/** Keys in the `prefs` table (see docs/DATA-MODEL.md). */
export const PREF_KEYS = ["appearance", "profile", "location", "lists"] as const;
export type PrefKey = (typeof PREF_KEYS)[number];

export interface ProfilePref {
  /** Name used in the greeting. */
  name: string;
}

export interface LocationPref {
  /** What the greeting shows, e.g. "San Jose, CA". */
  label: string;
  lat?: number;
  lng?: number;
}

export interface ListsPref {
  /** Show archived cards in lists. */
  showArchived: boolean;
}

export interface Prefs {
  appearance: AppearancePref;
  profile: ProfilePref;
  location: LocationPref | null;
  lists: ListsPref;
}

export const DEFAULT_PREFS: Prefs = {
  appearance: DEFAULT_APPEARANCE,
  profile: { name: "" },
  location: null,
  lists: { showArchived: false },
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Reads the raw `GET /api/prefs` answer, ignoring anything malformed so a bad value never breaks the app. */
export function parsePrefs(raw: unknown): Prefs {
  const prefs: Prefs = {
    appearance: { ...DEFAULT_APPEARANCE },
    profile: { ...DEFAULT_PREFS.profile },
    location: null,
    lists: { ...DEFAULT_PREFS.lists },
  };
  if (!isRecord(raw)) return prefs;
  prefs.appearance = parseAppearance(raw.appearance);
  const profile = raw.profile;
  if (isRecord(profile) && typeof profile.name === "string") prefs.profile.name = profile.name.trim();
  prefs.location = parseLocation(raw.location);
  const lists = raw.lists;
  if (isRecord(lists) && typeof lists.showArchived === "boolean") prefs.lists.showArchived = lists.showArchived;
  return prefs;
}

/** A location with a label (Orbit today's "near …" prefix dropped), and coordinates only when both are numbers. */
export function parseLocation(raw: unknown): LocationPref | null {
  if (!isRecord(raw) || typeof raw.label !== "string") return null;
  const label = raw.label.replace(/^near /i, "").trim();
  if (!label) return null;
  const lat = finite(raw.lat);
  const lng = finite(raw.lng);
  return { label, ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}) };
}

export type PartOfDay = "morning" | "afternoon" | "evening";

/** Morning 5–12, afternoon 12–17, evening otherwise (the same rule as Orbit today). */
export function partOfDay(date: Date): PartOfDay {
  const h = date.getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  return "evening";
}

/** "Good evening, Sid"; just "Good evening" before a name is set. */
export function greeting(name: string, date: Date): string {
  const who = name.trim();
  return `Good ${partOfDay(date)}${who ? `, ${who}` : ""}`;
}

/** Each kind's hue (0–360), used for its tile and dot. */
export const KIND_HUES: Record<Kind, number> = {
  "To-do": 8,
  Experience: 200,
  Place: 28,
  Movie: 265,
  Show: 300,
  Book: 150,
  Game: 330,
  Podcast: 180,
  Recipe: 45,
  Learning: 225,
  Thing: 90,
  Money: 120,
  Note: 210,
};

/** Hue for any kind name; unknown kinds get a neutral blue. */
export function kindHue(kind: string): number {
  return (KIND_HUES as Record<string, number>)[kind] ?? 210;
}
