import { Link, NavLink } from "react-router";
import { useItemSummaries, usePrefs } from "../api/queries.js";

const VIEWS = [
  { to: "/", label: "Today", end: true },
  { to: "/all", label: "Everything", end: false },
  { to: "/map", label: "Map", end: false },
  { to: "/near", label: "Near me", end: false },
  { to: "/review", label: "Review", end: false },
] as const;

/** Views only. Kinds are tiles on the home page, not rail entries. */
export function Rail({ open, inert = false }: { open: boolean; inert?: boolean }) {
  const items = useItemSummaries();
  const live = items.data?.filter((i) => !i.deleted && !i.archived).length;
  // Near me shows where you are (the city part), or "set" until a location is chosen.
  const here = usePrefs().data?.location;
  const nearNote = here ? here.label.split(",")[0] : "set";

  return (
    <nav className={`rail${open ? " open" : ""}`} aria-label="Views" inert={inert}>
      <Link className="brand" to="/" aria-label="Orbit home">
        <b>Orbit</b>
      </Link>
      <div className="rail-scroll">
        <div className="rail-head">Views</div>
        {VIEWS.map((v) => (
          <NavLink key={v.to} to={v.to} end={v.end} className={({ isActive }) => `rail-item${isActive ? " on" : ""}`}>
            {v.label}
            {v.to === "/all" && live !== undefined && <span className="n">{live.toLocaleString()}</span>}
            {v.to === "/near" && <span className="n">{nearNote}</span>}
          </NavLink>
        ))}
      </div>
      <div className="rail-foot">
        <NavLink to="/settings" className={({ isActive }) => `rail-item${isActive ? " on" : ""}`}>
          ⚙ Settings
        </NavLink>
      </div>
    </nav>
  );
}
