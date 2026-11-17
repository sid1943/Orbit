import { CITIES, findCity } from "./places.js";
import type { LocationPref } from "./prefs.js";
import { distanceMiles } from "./today.js";

/**
 * Setting where Sid is (the Location panel), with Orbit today's rules: use the device, type a city,
 * paste a Google Maps link or type coordinates, or pick a city.
 */

/** Rounds to about 10 m: precise enough for distances, without keeping an exact address. */
export const roundCoord = (n: number): number => Math.round(n * 1e4) / 1e4;

const valid = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/**
 * Coordinates in a Google Maps link (`@37.33,-121.89,15z`, `!3d…!4d…`, `?q=` / `query=` / `ll=` / `center=`)
 * or typed as "37.33, -121.89". Null when there are none.
 */
export function parseLatLng(text: string): { lat: number; lng: number } | null {
  const s = text.trim();
  const m =
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(s) ??
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(s) ??
    /[?&](?:q|query|ll|center)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i.exec(s) ??
    /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(s);
  if (!m) return null;
  const lat = Number(m[1]),
    lng = Number(m[2]);
  return valid(lat, lng) ? { lat, lng } : null;
}

/** The closest city in `CITIES` when it's within 60 miles ("San Jose, CA"), else the coordinates ("37.10, -120.50"). */
export function nearestCity(lat: number, lng: number): string {
  let best: { name: string; miles: number } | null = null;
  for (const c of CITIES) {
    const miles = distanceMiles({ lat, lng }, c);
    if (!best || miles < best.miles) best = { name: c.name, miles };
  }
  return best && best.miles < 60 ? best.name : `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
}

/** A spot as a location to save: rounded, labelled with the nearest city. */
export function locationAt(lat: number, lng: number): LocationPref {
  return { label: nearestCity(lat, lng), lat: roundCoord(lat), lng: roundCoord(lng) };
}

export type LocationInput = { location: LocationPref; error?: undefined } | { location?: undefined; error: string };

/** What the Location panel's box says: a known city, a Maps link or coordinates. */
export function readLocationInput(text: string): LocationInput {
  const s = text.trim();
  if (!s) return { error: "Type a city, paste a Google Maps link, or pick a city below." };
  const at = parseLatLng(s);
  if (at) return { location: locationAt(at.lat, at.lng) };
  if (/^https?:\/\//i.test(s) || /maps\.app\.goo\.gl|goo\.gl\/maps/i.test(s))
    return {
      error:
        "That link has no coordinates in it. Open it in Google Maps, then copy the address bar (it has @lat,lng), or pick a city.",
    };
  const city = findCity(s);
  if (city) return { location: { label: city.name, lat: city.lat, lng: city.lng } };
  return { error: `Orbit doesn't know "${s}". Pick a city below, or paste a Google Maps link.` };
}
