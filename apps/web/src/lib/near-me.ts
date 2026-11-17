import { categoryLabel, type PlaceRow, type SyncItem } from "@orbit/core";
import { placesOnCards, type NearbyOnCard } from "./near-you.js";

/** Distance choices on Near me, in miles. */
export const RADII = [5, 25, 100, 500, "any"] as const;
export type Radius = (typeof RADII)[number];

export const RADIUS_OPTIONS = RADII.map((r) => ({ value: r, label: r === "any" ? "Any" : `${r} mi` }));

/** The distance in the address (`?within=25`); 100 miles when it's missing or unknown. */
export function parseRadius(raw: string | null): Radius {
  if (raw === "any") return "any";
  const n = Number(raw);
  return (RADII as readonly (number | string)[]).includes(n) ? (n as Radius) : 100;
}

export interface NearMeOptions {
  radius: Radius;
  showDone: boolean;
  /** Only this category (a chip), or every category. */
  category: string | null;
  showArchived?: boolean;
}

export interface CityGroup {
  city: string;
  /** Miles to the city center. */
  miles: number;
  places: NearbyOnCard[];
}

export interface NearMe {
  /** Places within the distance (and done ones when shown), before the category chip. */
  inRange: number;
  /** Category chips for what's in range, most first. */
  categories: { category: string; label: string; count: number }[];
  /** The chip in force: null when none is chosen, or the chosen one has nothing in range. */
  category: string | null;
  /** How many places the list shows. */
  count: number;
  /** Places with an exact spot, closest first. */
  exact: NearbyOnCard[];
  /** Places with no exact spot, grouped by their city, closest city first. */
  cities: CityGroup[];
  /** The closest open place anywhere, for when nothing is in range. */
  closest: NearbyOnCard | null;
}

/** Near me, the same rule as Orbit today: places on your lists by distance, then filtered and grouped. */
export function nearMe(
  places: readonly PlaceRow[],
  cards: readonly SyncItem[],
  here: { lat: number; lng: number },
  { radius, showDone, category, showArchived = false }: NearMeOptions,
): NearMe {
  const all = placesOnCards(places, cards, here, showArchived);
  const pool = all.filter((p) => (showDone || !p.done) && (radius === "any" || p.miles <= radius));
  const counts = new Map<string, number>();
  for (const p of pool) counts.set(p.place.category, (counts.get(p.place.category) ?? 0) + 1);
  const chip = category && counts.has(category) ? category : null;
  const list = chip ? pool.filter((p) => p.place.category === chip) : pool;
  const byCity = new Map<string, NearbyOnCard[]>();
  for (const p of list) {
    if (!p.approx || !p.city) continue;
    const group = byCity.get(p.city);
    if (group) group.push(p);
    else byCity.set(p.city, [p]);
  }
  return {
    inRange: pool.length,
    categories: [...counts]
      .map(([c, count]) => ({ category: c, label: categoryLabel(c), count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    category: chip,
    count: list.length,
    exact: list.filter((p) => !p.approx),
    // The list is closest first, so each group's first place is its distance.
    cities: [...byCity].map(([city, ps]) => ({ city, miles: ps[0]!.miles, places: ps })),
    closest: all.find((p) => !p.done) ?? null,
  };
}
