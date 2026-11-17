import type { LocationPref } from "@orbit/core";

/** Rounds to about 10 m: precise enough for distances, without keeping an exact address. */
export const roundCoord = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Asks the browser where this device is. Rejects with a sentence to show when it can't. */
export function locateDevice(): Promise<LocationPref> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("This browser can't share its location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        resolve({ label: "Current location", lat: roundCoord(coords.latitude), lng: roundCoord(coords.longitude) }),
      () => reject(new Error("Location permission was refused.")),
      { timeout: 10_000 },
    );
  });
}
