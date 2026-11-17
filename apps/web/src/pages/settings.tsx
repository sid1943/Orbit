import { NavLink, useParams } from "react-router";
import { usePrefs } from "../api/queries.js";
import { PageBar } from "../components/page-bar.js";
import {
  AboutPane,
  AppearancePane,
  DataPane,
  GuidePane,
  ListsPane,
  LocationPane,
  ProfilePane,
} from "../components/settings-panes.js";
import { SETTINGS_SECTIONS, settingsSection } from "../lib/settings-sections.js";

/** Settings laid out like macOS System Settings: categories on the left, the chosen one on the right. */
export function Settings() {
  const section = settingsSection(useParams().section);
  const prefs = usePrefs();
  const current = SETTINGS_SECTIONS.find((s) => s.id === section)!;

  let pane;
  if (section === "guide") pane = <GuidePane />;
  else if (section === "about") pane = <AboutPane />;
  else if (prefs.isPending) pane = <p className="muted">Loading your settings…</p>;
  else if (!prefs.data) pane = <p className="error">Settings can&apos;t be read until the Orbit API answers.</p>;
  else {
    const p = prefs.data;
    pane = {
      appearance: <AppearancePane prefs={p} />,
      profile: <ProfilePane prefs={p} />,
      location: <LocationPane prefs={p} />,
      lists: <ListsPane prefs={p} />,
      data: <DataPane prefs={p} />,
    }[section];
  }

  return (
    <>
      <PageBar title="Settings" />
      <div className="settings">
        <nav className="settings-nav" aria-label="Settings categories">
          {SETTINGS_SECTIONS.map((s) => (
            <NavLink
              key={s.id}
              to={`/settings/${s.id}`}
              className={`settings-nav-item${s.id === section ? " on" : ""}`}
              aria-current={s.id === section ? "page" : undefined}
            >
              <span className="sic" aria-hidden="true">
                {s.icon}
              </span>
              <span>
                <b>{s.name}</b>
                <small>{s.sub}</small>
              </span>
            </NavLink>
          ))}
        </nav>
        <section className="settings-pane" aria-labelledby="settings-title">
          <h3 id="settings-title">{current.name}</h3>
          <div className="settings-rows">{pane}</div>
        </section>
      </div>
    </>
  );
}
