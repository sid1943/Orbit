import { greeting } from "@orbit/core";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { usePrefs, useSetPref } from "../api/queries.js";
import { longDate } from "../lib/dates.js";

/** Greeting, date, location and New: the same on every page. Back is absolute: it always goes to Today. */
export function TopBar({ isHome, onMenu }: { isHome: boolean; onMenu: () => void }) {
  const prefs = usePrefs();
  const setLocation = useSetPref("location");
  const navigate = useNavigate();
  const [locError, setLocError] = useState("");
  const now = new Date();
  const name = prefs.data?.profile.name || "Sid";
  const place = prefs.data?.location;

  const useMyLocation = () => {
    setLocError("");
    if (!("geolocation" in navigator)) return setLocError("This browser can't share its location.");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        setLocation.mutate({
          label: "Current location",
          lat: Math.round(coords.latitude * 1e4) / 1e4,
          lng: Math.round(coords.longitude * 1e4) / 1e4,
        }),
      () => setLocError("Location permission was refused."),
      { timeout: 10_000 },
    );
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
          <button type="button" className="link-btn" onClick={() => navigate("/settings/location")}>
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
        {(locError || setLocation.isError) && (
          <div className="sub error" role="alert">
            {locError || "Couldn't save your location."}
          </div>
        )}
      </div>
      <button
        type="button"
        className="btn primary new-btn"
        disabled
        title="New item arrives with the card panel (build step 3)"
      >
        New
      </button>
    </header>
  );
}
