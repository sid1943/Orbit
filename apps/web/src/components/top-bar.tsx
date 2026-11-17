import { greeting } from "@orbit/core";
import { Link } from "react-router";
import { usePrefs, useSetPref } from "../api/queries.js";
import { longDate } from "../lib/dates.js";
import { locateDevice } from "../lib/locate.js";
import { useOpenLocation } from "../lib/location-panel.js";

/** Greeting, date, location and New: the same on every page. Back is absolute: it always goes to Today. */
export function TopBar({ isHome, onMenu, onNew }: { isHome: boolean; onMenu: () => void; onNew: () => void }) {
  const prefs = usePrefs();
  const setLocation = useSetPref("location");
  const openLocation = useOpenLocation();
  const now = new Date();
  const name = prefs.data?.profile.name || "Sid";
  const place = prefs.data?.location;

  // When the device can't say where it is, the Location panel opens with the reason and the other ways.
  const useMyLocation = () => {
    locateDevice()
      .then((loc) => setLocation.mutate(loc))
      .catch((e: unknown) => openLocation(e instanceof Error ? e.message : String(e)));
  };

  return (
    <header className="top">
      <button type="button" className="btn menu-btn" onClick={onMenu} aria-label="Open menu">
        ☰
      </button>
      {!isHome && (
        <Link className="btn back-btn" to="/" title="Back to Today" aria-label="Back to Today">
          ← Back
        </Link>
      )}
      <div>
        <h1>{greeting(name, now)}</h1>
        <div className="sub">
          <span>{longDate(now)}</span>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            className="link-btn"
            onClick={() => openLocation()}
            title={place ? "Change your location" : undefined}
          >
            {place ? (
              <>
                <span className="pin">●</span> {place.label}
              </>
            ) : (
              "Set your location"
            )}
          </button>
          <span aria-hidden="true">·</span>
          <button type="button" className="link-btn" onClick={useMyLocation} title="Use this device's location">
            Use my location
          </button>
        </div>
        {setLocation.isError && (
          <div className="sub error" role="alert">
            Couldn&apos;t save your location.
          </div>
        )}
      </div>
      <button type="button" className="btn primary new-btn" onClick={onNew} title="New item (N)">
        New
      </button>
    </header>
  );
}
