import { Link, NavLink } from "react-router";

const VIEWS = [{ to: "/", label: "Center Base", end: true }] as const;

/** Views only. Kinds are tiles on the home page, not rail entries. */
export function Rail({ open, inert = false }: { open: boolean; inert?: boolean }) {
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
