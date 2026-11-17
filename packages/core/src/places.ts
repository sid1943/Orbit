import type { Confidence, ReviewDecision } from "./types.js";
import { reviewedLinked } from "./sync.js";
import { distanceMiles } from "./today.js";

/**
 * Places on Sid's lists and how far they are, as Orbit today works it out: every card and checklist
 * row linked to a place counts. A place with no exact spot but a known city in its location is put at
 * that city's center (shown as "in San Jose" or "~40 mi").
 */

export interface City {
  name: string;
  lat: number;
  lng: number;
}

/** Cities offered when setting a location, also used as centers for places with no exact spot. */
export const CITIES: readonly City[] = [
  { name: "San Jose, CA", lat: 37.3382, lng: -121.8863 },
  { name: "San Francisco, CA", lat: 37.7749, lng: -122.4194 },
  { name: "Los Angeles, CA", lat: 34.0522, lng: -118.2437 },
  { name: "San Diego, CA", lat: 32.7157, lng: -117.1611 },
  { name: "Seattle, WA", lat: 47.6062, lng: -122.3321 },
  { name: "Portland, OR", lat: 45.5152, lng: -122.6784 },
  { name: "Las Vegas, NV", lat: 36.1699, lng: -115.1398 },
  { name: "Phoenix, AZ", lat: 33.4484, lng: -112.074 },
  { name: "Denver, CO", lat: 39.7392, lng: -104.9903 },
  { name: "Salt Lake City, UT", lat: 40.7608, lng: -111.891 },
  { name: "Austin, TX", lat: 30.2672, lng: -97.7431 },
  { name: "Dallas, TX", lat: 32.7767, lng: -96.797 },
  { name: "Houston, TX", lat: 29.7604, lng: -95.3698 },
  { name: "Chicago, IL", lat: 41.8781, lng: -87.6298 },
  { name: "Minneapolis, MN", lat: 44.9778, lng: -93.265 },
  { name: "Cleveland, OH", lat: 41.4993, lng: -81.6944 },
  { name: "Columbus, OH", lat: 39.9612, lng: -82.9988 },
  { name: "Detroit, MI", lat: 42.3314, lng: -83.0458 },
  { name: "Atlanta, GA", lat: 33.749, lng: -84.388 },
  { name: "Miami, FL", lat: 25.7617, lng: -80.1918 },
  { name: "Orlando, FL", lat: 28.5383, lng: -81.3792 },
  { name: "Nashville, TN", lat: 36.1627, lng: -86.7816 },
  { name: "Charlotte, NC", lat: 35.2271, lng: -80.8431 },
  { name: "Raleigh, NC", lat: 35.7796, lng: -78.6382 },
  { name: "Richmond, VA", lat: 37.5407, lng: -77.436 },
  { name: "Lynchburg, VA", lat: 37.4138, lng: -79.1422 },
  { name: "Washington, DC", lat: 38.9072, lng: -77.0369 },
  { name: "Philadelphia, PA", lat: 39.9526, lng: -75.1652 },
  { name: "Jersey City, NJ", lat: 40.7178, lng: -74.0431 },
  { name: "New York, NY", lat: 40.7128, lng: -74.006 },
  { name: "Boston, MA", lat: 42.3601, lng: -71.0589 },
  { name: "Toronto, ON", lat: 43.6532, lng: -79.3832 },
  { name: "Vancouver, BC", lat: 49.2827, lng: -123.1207 },
  { name: "London, UK", lat: 51.5074, lng: -0.1278 },
  { name: "Paris, France", lat: 48.8566, lng: 2.3522 },
  { name: "Dubai, UAE", lat: 25.2048, lng: 55.2708 },
  { name: "Mumbai, India", lat: 19.076, lng: 72.8777 },
  { name: "Delhi, India", lat: 28.6139, lng: 77.209 },
  { name: "Ahmedabad, India", lat: 23.0225, lng: 72.5714 },
  { name: "Vadodara, India", lat: 22.3072, lng: 73.1812 },
  { name: "Tokyo, Japan", lat: 35.6762, lng: 139.6503 },
  { name: "Sydney, Australia", lat: -33.8688, lng: 151.2093 },
];

/** More city centers, for list locations that name a town or borough. */
const MORE_CENTERS: readonly (readonly [string, number, number])[] = [
  ["hoboken", 40.744, -74.0324],
  ["iselin", 40.5754, -74.3224],
  ["buffalo", 42.8864, -78.8784],
  ["pune", 18.5204, 73.8567],
  ["atlantic city", 39.3643, -74.4229],
  ["santa clara", 37.3541, -121.9552],
  ["palo alto", 37.4419, -122.143],
  ["oakland", 37.8044, -122.2712],
  ["berkeley", 37.8715, -122.273],
  ["mountain view", 37.3861, -122.0839],
  ["sunnyvale", 37.3688, -122.0363],
  ["cupertino", 37.323, -122.0322],
  ["santa cruz", 36.9741, -122.0308],
  ["manhattan", 40.7831, -73.9712],
  ["brooklyn", 40.6782, -73.9442],
  ["queens", 40.7282, -73.7949],
  ["bronx", 40.8448, -73.8648],
  ["newark", 40.7357, -74.1724],
  ["baltimore", 39.2904, -76.6122],
  ["pittsburgh", 40.4406, -79.9959],
  ["roanoke", 37.271, -79.9414],
  ["charlottesville", 38.0293, -78.4767],
];

const CENTERS = new Map<string, readonly [number, number]>([
  ...MORE_CENTERS.map(([n, lat, lng]) => [n, [lat, lng] as const] as const),
  // The main list wins where both have a city.
  ...CITIES.map((c) => [c.name.split(",")[0]!.toLowerCase(), [c.lat, c.lng] as const] as const),
]);

/** Categories that are places to go. */
export const PLACE_CATEGORIES: ReadonlySet<string> = new Set([
  "natural_place",
  "building",
  "us_park",
  "museum",
  "district",
  "ballpark",
  "fed_bank",
  "burger",
  "nyc",
  "nyc_building",
  "done_place",
  "pagoda",
  "city_todo",
  "eatery",
  "sport_event",
]);

/** Categories whose coordinates are a head office, studio or nothing in particular: never "near you". */
export const NO_DISTANCE: ReadonlySet<string> = new Set([
  "chain",
  "show_taping",
  "game",
  "phenomenon",
  "festival",
  "event",
]);

/** City-based lists, where a place with no exact spot can stand at its city's center. */
export const CITY_CATEGORIES: ReadonlySet<string> = new Set([
  "city_todo",
  "eatery",
  "pagoda",
  "burger",
  "nyc",
  "nyc_building",
  "done_place",
]);

/** One card or checklist row linked to a place (`GET /api/places`). */
export interface PlaceRow {
  itemId: string;
  /** Checklist and row index on the card, or null when the card itself is the place. */
  checklist: number | null;
  row: number | null;
  /** The row's text, or the card's title. */
  text: string;
  done: boolean;
  entityId: string;
  category: string;
  /** With Sid's review answer applied. */
  confidence: Confidence | null;
  lat: number | null;
  lng: number | null;
  location: string | null;
}

/** `GET /api/places`. `items` null means this is every place; otherwise replace the places of just these cards. */
export interface PlacesPage {
  places: PlaceRow[];
  items: string[] | null;
  at: number;
}

export interface PlacesState {
  places: PlaceRow[];
  at: number;
}

/** The city center for a city-based list place: only when the location starts with a known city. */
export function cityCenter(
  category: string,
  location: string | null | undefined,
): { city: string; lat: number; lng: number } | null {
  if (!CITY_CATEGORIES.has(category)) return null;
  // "Cleveland - Downtown, Ohio" -> "cleveland". A state like "Washington, USA" never matches a city.
  const first = (location ?? "")
    .split(",")[0]!
    .toLowerCase()
    .replace(/\s*-\s*.*$/, "")
    .trim();
  const hit = CENTERS.get(first);
  if (!hit) return null;
  return { city: first.replace(/\b\w/g, (c) => c.toUpperCase()), lat: hit[0], lng: hit[1] };
}

/** Where a place is: its own spot, or its city's center (`approx`). Null when it has neither or isn't a place to go. */
export function placeSpot(
  p: Pick<PlaceRow, "category" | "lat" | "lng" | "location">,
): { lat: number; lng: number; approx: boolean; city: string | null } | null {
  if (NO_DISTANCE.has(p.category)) return null;
  if (p.lat != null && p.lng != null) return { lat: p.lat, lng: p.lng, approx: false, city: null };
  if (!PLACE_CATEGORIES.has(p.category)) return null;
  const c = cityCenter(p.category, p.location);
  return c ? { lat: c.lat, lng: c.lng, approx: true, city: c.city } : null;
}

/** A place's row as a list shows it: no leading numbers, bold marks or tabs. */
export function placeLabel(text: string): string {
  return text
    .replace(/^\s*\d+(\.\d+)?[.)]?\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/\t/g, " · ")
    .trim();
}

export interface NearbyPlace {
  place: PlaceRow;
  label: string;
  miles: number;
  /** Placed at its city's center (no exact spot yet). */
  approx: boolean;
  city: string | null;
}

/** Places with a spot, closest first. */
export function placesByDistance(places: readonly PlaceRow[], here: { lat: number; lng: number }): NearbyPlace[] {
  const out: NearbyPlace[] = [];
  for (const place of places) {
    const spot = placeSpot(place);
    if (!spot) continue;
    out.push({
      place,
      label: placeLabel(place.text),
      miles: distanceMiles(here, spot),
      approx: spot.approx,
      city: spot.city,
    });
  }
  return out.sort((a, b) => a.miles - b.miles);
}

/** The place fields once Sid's review answer is applied (a rejected guess loses its spot). */
export function reviewedPlace<T extends Pick<PlaceRow, "confidence" | "lat" | "lng">>(
  p: T,
  decision: ReviewDecision | null | undefined,
): T {
  return { ...p, ...reviewedLinked(p, decision) };
}

/** Applies one `GET /api/places` answer to what the app holds. */
export function mergePlaces(prev: PlacesState | undefined, page: PlacesPage): PlacesState {
  if (!prev || page.items === null) return { places: page.places, at: page.at };
  const changed = new Set(page.items);
  return {
    places: [...prev.places.filter((p) => !changed.has(p.itemId)), ...page.places],
    at: Math.max(prev.at, page.at),
  };
}

/** What each place category is called on chip rows (Near me, Review), as in Orbit today. */
export const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  natural_place: "Natural places",
  building: "Buildings",
  us_park: "US parks",
  museum: "Museums",
  district: "Luxury districts",
  ballpark: "Ballparks",
  fed_bank: "Federal Reserve banks",
  burger: "Burger spots",
  nyc: "New York",
  nyc_building: "NYC buildings",
  done_place: "Done places",
  pagoda: "Peace pagodas",
  city_todo: "City to-dos",
  eatery: "Places to eat",
  sport_event: "Sports",
  show_taping: "Show tapings",
  chain: "Restaurant chains",
  phenomenon: "Natural phenomena",
  festival: "Festivals",
  trip: "Trips",
  movie: "Movies",
  show: "TV shows",
  book: "Books",
  game: "Video games",
  card: "Cards",
};

/** A category's name for people: its label, or the raw name with spaces ("new_thing" → "New thing"). */
export function categoryLabel(category: string): string {
  const known = CATEGORY_LABELS[category];
  if (known) return known;
  const words = category.replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : category;
}

/**
 * A city Orbit knows by name: a `CITIES` entry ("San Jose, CA", or just "san jose"), or one of the extra
 * town and borough centers ("Hoboken"). Null when it isn't known.
 */
export function findCity(name: string): City | null {
  const s = name.trim().toLowerCase();
  if (s.length < 2) return null;
  const first = s.split(",")[0]!.trim();
  const listed =
    CITIES.find((c) => c.name.toLowerCase() === s) ??
    CITIES.find((c) => c.name.toLowerCase().startsWith(s)) ??
    CITIES.find((c) => c.name.split(",")[0]!.toLowerCase() === first);
  if (listed) return listed;
  const more = MORE_CENTERS.find(([n]) => n === first);
  return more ? { name: more[0].replace(/\b\w/g, (c) => c.toUpperCase()), lat: more[1], lng: more[2] } : null;
}
