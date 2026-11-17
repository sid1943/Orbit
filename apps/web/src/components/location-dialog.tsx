import { CITIES, readLocationInput, type LocationPref } from "@orbit/core";
import { useEffect, useRef, useState } from "react";
import { usePrefs, useSetPref } from "../api/queries.js";
import { locateDevice } from "../lib/locate.js";

/**
 * The Location panel, as in Orbit today: use this device's location, type a city, paste a Google Maps link or
 * coordinates, or pick a city. Saving closes it; the place is remembered until it's changed or cleared.
 */
export function LocationDialog({ note, onClose }: { note?: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const current = usePrefs().data?.location ?? null;
  const save = useSetPref("location");
  const [text, setText] = useState("");
  const [message, setMessage] = useState(note ?? "");
  const [problem, setProblem] = useState("");
  const [finding, setFinding] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const keep = (loc: LocationPref | null) => save.mutate(loc, { onSuccess: () => dialog.current?.close() });

  const useDevice = () => {
    setMessage("");
    setFinding(true);
    locateDevice()
      .then(keep)
      .catch((e: unknown) => setMessage(e instanceof Error ? e.message : String(e)))
      .finally(() => setFinding(false));
  };

  const saveTyped = () => {
    const read = readLocationInput(text);
    if (read.error !== undefined) setProblem(read.error);
    else keep(read.location);
  };

  return (
    <dialog ref={dialog} className="dialog location-dialog" aria-labelledby="location-title" onClose={onClose}>
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          saveTyped();
        }}
      >
        <div className="location-now">
          <span className="muted">Where are you?</span>
          <h2 id="location-title">{current ? current.label : "Set your location"}</h2>
        </div>
        {message && (
          <p className="location-note" role="status">
            {message}
          </p>
        )}
        <button type="button" className="btn primary" onClick={useDevice} disabled={finding || save.isPending}>
          {finding ? "Finding you…" : "Use my location"}
        </button>
        <label className="field location-field">
          <span>Or type a city, paste a Google Maps link, or coordinates like 37.33, -121.89</span>
          <input
            className="input"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setProblem("");
            }}
            placeholder="San Jose, CA"
            list="location-cities"
            autoComplete="off"
            autoFocus
            aria-invalid={!!problem}
            aria-describedby="location-problem"
          />
          <datalist id="location-cities">
            {CITIES.map((c) => (
              <option key={c.name} value={c.name} />
            ))}
          </datalist>
        </label>
        <p id="location-problem" className="error" role="alert">
          {problem || (save.isError ? "Couldn't save your location." : "")}
        </p>
        <div className="location-pick">
          <span className="muted">Or pick one</span>
          <div className="cloud">
            {CITIES.map((c) => (
              <button
                key={c.name}
                type="button"
                className={`chip${current?.label === c.name ? " on" : ""}`}
                onClick={() => keep({ label: c.name, lat: c.lat, lng: c.lng })}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="dialog-buttons">
          {current && (
            <button type="button" className="btn" onClick={() => keep(null)}>
              Clear location
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={save.isPending}>
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}
