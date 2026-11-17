import {
  type AppearancePref,
  DETAIL_STYLES,
  HEADING_FONTS,
  type Prefs,
  TEXT_FONTS,
  TEXT_SIZES,
  THEMES,
  fontStylesheet,
  greeting,
} from "@orbit/core";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useApi, useHealth, useItemSummaries, useSetPref } from "../api/queries.js";
import { loadFont } from "../lib/appearance.js";
import { type Backup, buildBackup, saveFile } from "../lib/backup.js";
import { GUIDE } from "../lib/guide.js";
import { locateDevice } from "../lib/locate.js";
import { useOpenLocation } from "../lib/location-panel.js";
import { PAGES, PANELS } from "../routes.js";
import { Segmented } from "./segmented.js";
import { SettingRow } from "./setting-row.js";

const family = (f: string | null) => (f ? `${f}, sans-serif` : undefined);

/** Shown under a pane when a save fails. Saving itself is silent. */
function SaveError({ show }: { show: boolean }) {
  return show ? (
    <p className="error" role="alert">
      Couldn&apos;t save that setting. Is the Orbit API running?
    </p>
  ) : null;
}

export function AppearancePane({ prefs }: { prefs: Prefs }) {
  const save = useSetPref("appearance");
  const a = prefs.appearance;
  const set = (patch: Partial<AppearancePref>) => save.mutate({ ...a, ...patch });
  const sample = `${greeting(prefs.profile.name || "Sid", new Date())} · 3,728 cards · 1965`;

  // The picker shows each font in itself, so load them all while it is open.
  useEffect(() => {
    for (const f of [...TEXT_FONTS, ...HEADING_FONTS]) loadFont(fontStylesheet(f));
  }, []);

  return (
    <>
      <SettingRow title="Theme">
        <Segmented
          label="Theme"
          value={a.theme}
          options={THEMES.map((t) => ({ value: t.id, label: t.name }))}
          onChange={(theme) => set({ theme })}
        />
      </SettingRow>
      <SettingRow title="Text size" hint="Everything grows with it">
        <Segmented
          label="Text size"
          value={a.size}
          options={TEXT_SIZES.map((s) => ({ value: s.value, label: s.name }))}
          onChange={(size) => set({ size })}
        />
      </SettingRow>
      <SettingRow title="Headings">
        <Segmented
          label="Heading font"
          value={a.heads}
          options={HEADING_FONTS.map((f) => ({ value: f.id, label: f.name, style: { fontFamily: family(f.family) } }))}
          onChange={(heads) => set({ heads })}
        />
      </SettingRow>
      <SettingRow title="Small detail lines" hint="The grey lines under items: links, places, counts">
        <Segmented
          label="Detail lines"
          value={a.detail}
          options={DETAIL_STYLES.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(detail) => set({ detail })}
        />
      </SettingRow>
      <SettingRow title="Font" wide>
        <div className="font-grid" role="radiogroup" aria-label="Text font">
          {TEXT_FONTS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={a.font === f.id}
              className={`font-opt${a.font === f.id ? " on" : ""}`}
              style={{ fontFamily: family(f.family) }}
              onClick={() => set({ font: f.id })}
            >
              <b>{f.name}</b>
              <span>{f.note}</span>
              <span className="sample">{sample}</span>
            </button>
          ))}
        </div>
      </SettingRow>
      <SaveError show={save.isError} />
    </>
  );
}

export function ProfilePane({ prefs }: { prefs: Prefs }) {
  const save = useSetPref("profile");
  const saved = prefs.profile.name;
  const commit = (value: string) => {
    const name = value.trim();
    if (name !== saved) save.mutate({ name });
  };
  return (
    <>
      <SettingRow title="Name in the greeting" hint="Shown as “Good evening, …” at the top" htmlFor="set-name">
        <input
          id="set-name"
          className="input"
          key={saved}
          defaultValue={saved}
          placeholder="Sid"
          autoComplete="off"
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(e.currentTarget.value);
          }}
        />
      </SettingRow>
      <SaveError show={save.isError} />
    </>
  );
}

export function LocationPane({ prefs }: { prefs: Prefs }) {
  const save = useSetPref("location");
  const openLocation = useOpenLocation();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const place = prefs.location;

  const useMine = () => {
    setError("");
    setBusy(true);
    locateDevice()
      .then((loc) => save.mutate(loc))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };

  return (
    <>
      <SettingRow title="Where you are" hint="Used for Near me and distances. Kept until you change it.">
        <div className="sbtns">
          <span className="value">{place ? place.label : "Not set"}</span>
          <button type="button" className="btn" onClick={() => openLocation()}>
            {place ? "Change" : "Set location"}
          </button>
          <button type="button" className="btn" onClick={useMine} disabled={busy}>
            {busy ? "Finding you…" : "Use my location"}
          </button>
          {place && (
            <button type="button" className="btn" onClick={() => save.mutate(null)}>
              Clear
            </button>
          )}
        </div>
      </SettingRow>
      {place?.lat !== undefined && (
        <SettingRow title="Coordinates">
          <span className="mono muted">
            {place.lat}, {place.lng}
          </span>
        </SettingRow>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <SaveError show={save.isError} />
    </>
  );
}

export function ListsPane({ prefs }: { prefs: Prefs }) {
  const save = useSetPref("lists");
  const items = useItemSummaries();
  const live = items.data?.filter((i) => !i.deleted);
  const archived = live?.filter((i) => i.archived).length;
  return (
    <>
      <SettingRow
        title="Show archived items"
        hint={
          live && archived !== undefined
            ? `${archived.toLocaleString()} archived, ${(live.length - archived).toLocaleString()} active`
            : undefined
        }
        htmlFor="set-archived"
      >
        <input
          id="set-archived"
          type="checkbox"
          className="switch"
          checked={prefs.lists.showArchived}
          onChange={(e) => save.mutate({ showArchived: e.currentTarget.checked })}
        />
      </SettingRow>
      <SaveError show={save.isError} />
    </>
  );
}

export function DataPane({ prefs }: { prefs: Prefs }) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [last, setLast] = useState<Backup["counts"] | null>(null);

  const download = () => {
    setBusy(true);
    setError("");
    buildBackup(api, prefs)
      .then((b) => {
        saveFile(b.name, b.json);
        setLast(b.counts);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };

  return (
    <>
      <SettingRow
        title="Backup"
        hint="One file with every card, list, link, review answer and your settings. Orbit can load it again."
      >
        <button type="button" className="btn primary" onClick={download} disabled={busy}>
          {busy ? "Gathering…" : "Download everything"}
        </button>
      </SettingRow>
      {last && (
        <p className="muted">
          The file holds {last.items.toLocaleString()} cards, {last.entities.toLocaleString()} linked things and{" "}
          {last.reviews.toLocaleString()} review answers.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          Couldn&apos;t make the file: {error}
        </p>
      )}
    </>
  );
}

export function GuidePane() {
  return (
    <>
      {GUIDE.map((g) => (
        <SettingRow key={g.title} title={g.title} wide>
          <ul className="guide">
            {g.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </SettingRow>
      ))}
    </>
  );
}

export function AboutPane() {
  const health = useHealth();
  return (
    <>
      <SettingRow title="Version">
        <span className="mono">
          App {__APP_VERSION__}
          {health.data ? ` · API ${health.data.version}` : ""}
        </span>
      </SettingRow>
      <SettingRow title="App map" hint="Every page and panel in Orbit, and what is on each" wide>
        <div className="app-map">
          <h4>Pages</h4>
          <ul>
            {PAGES.map((p) => (
              <li key={p.path}>
                {p.path.includes(":") ? (
                  <b>{p.title}</b>
                ) : (
                  <Link to={p.path}>
                    <b>{p.title}</b>
                  </Link>
                )}
                <span className="mono muted">{p.path}</span>
                <span>{p.what}</span>
              </li>
            ))}
          </ul>
          <h4>Panels</h4>
          <ul>
            {PANELS.map((p) => (
              <li key={p.title}>
                <b>{p.title}</b>
                <span className="mono muted">{p.opens}</span>
                <span>{p.what}</span>
              </li>
            ))}
          </ul>
        </div>
      </SettingRow>
    </>
  );
}
