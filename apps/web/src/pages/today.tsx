import { kindHue } from "@orbit/core";
import type { CSSProperties } from "react";
import { Link } from "react-router";
import { useItemSummaries } from "../api/queries.js";
import { countByKind, kindSlug } from "../lib/kinds.js";

/** Home. Step 1 shows the kind tiles; the rest of Today (Near you, Coming up, In progress…) comes in step 2. */
export function Today() {
  const items = useItemSummaries();
  const kinds = items.data ? countByKind(items.data) : [];

  return (
    <div className="pad">
      <section aria-label="Kinds">
        {items.isPending && !items.isError && <p className="muted">Loading your cards…</p>}
        <div className="kind-tiles">
          {kinds.map(({ kind, count }) => (
            <Link
              key={kind}
              to={`/kind/${kindSlug(kind)}`}
              className="kind-tile"
              style={{ "--kh": kindHue(kind) } as CSSProperties}
            >
              <span className="label">
                <i className="dot" aria-hidden="true" />
                {kind}
              </span>
              <span className="value">{count.toLocaleString()}</span>
            </Link>
          ))}
        </div>
      </section>
      {items.isSuccess && <p className="muted later">More of Today arrives in build step 2.</p>}
    </div>
  );
}
