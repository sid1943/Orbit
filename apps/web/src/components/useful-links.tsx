import type { ShownLink } from "@orbit/core";
import { Link } from "react-router";

/** The card's links, each by a readable name with its site underneath. Fix links comes with build step 5. */
export function UsefulLinks({ links }: { links: readonly ShownLink[] }) {
  return (
    <section className="card-sec">
      <h3>Useful links</h3>
      {links.length ? (
        <div className="ulinks">
          {links.map((l) =>
            l.cardId ? (
              <Link key={l.url} to={l.url} className="card-link">
                <b>{l.label}</b>
                <span>card in Orbit</span>
              </Link>
            ) : (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">
                <b>{l.label}</b>
                <span>
                  {l.note && <>{l.note} · </>}
                  <i>{l.host}</i>
                </span>
              </a>
            ),
          )}
        </div>
      ) : (
        <div className="muted">No links yet.</div>
      )}
    </section>
  );
}
