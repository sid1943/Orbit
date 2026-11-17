import { Link, NavLink } from "react-router";
import { useItemSummaries } from "../api/queries.js";

const VIEWS = [
  { to: "/", label: "Today", end: true },
  { to: "/all", label: "Everything", end: false },
  { to: "/map", label: "Map", end: false },
  { to: "/near", label: "Near me", end: false },
  { to: "/review", label: "Review", end: false },
] as const;

/** Views only. Kinds are tiles on the home page, not rail entries. */
export function Rail({ open }: { open: boolean }) {
  const items = useItemSummaries();
  const live = items.data?.filter((i) => !i.deleted && !i.archived).length;

  return (
    <nav className={`rail${open ? " open" : ""}`} aria-label="Views">
      <Link className="brand" to="/" aria-label="Orbit home">
        <b>Orbit</b>
      </Link>
      <div className="rail-scroll">
        <div className="rail-head">Views</div>
        {VIEWS.map((v) => (
          <NavLink key={v.to} to={v.to} end={v.end} className={({ isActive }) => `rail-item${isActive ? " on" : ""}`}>
            {v.label}
            {v.to === "/all" && live !== undefined && <span className="n">{live.toLocaleString()}</span>}
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
