import { locationAt, type LocationPref } from "@orbit/core";

/**
 * Asks the browser where this device is, labelled with the nearest city. Rejects with a sentence to show
 * when it can't (the Location panel shows it, with the other ways to set a place).
 */
export function locateDevice(): Promise<LocationPref> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new Error("This browser can't share its location. Pick a city or paste a Google Maps link."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve(locationAt(coords.latitude, coords.longitude)),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Location access is blocked for this page. Pick a city or paste a Google Maps link instead."
              : "Couldn't get your location just now. Pick a city or paste a Google Maps link instead.",
          ),
        ),
      { timeout: 12_000, maximumAge: 600_000 },
    );
  });
}
