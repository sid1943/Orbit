import type { SyncItem } from "@orbit/core";
import { Link } from "react-router";
import { countByKind, kindSlug } from "../lib/kinds.js";
import { kindStyle } from "./kind-chip.js";

/** Big kind tiles with counts; each opens its kind page. `current` marks the kind being viewed. */
export function KindTiles({ items, current }: { items: readonly SyncItem[]; current?: string }) {
  return (
    <nav className="kind-tiles" aria-label="Kinds">
      {countByKind(items).map(({ kind, count }) => (
        <Link
          key={kind}
          to={current === kind ? "/all" : `/kind/${kindSlug(kind)}`}
          className={`kind-tile${current === kind ? " on" : ""}`}
          aria-current={current === kind ? "page" : undefined}
          style={kindStyle(kind)}
        >
          <span className="label">
            <i className="dot" aria-hidden="true" />
            {kind}
          </span>
          <span className="value">{count.toLocaleString()}</span>
        </Link>
      ))}
    </nav>
  );
}
