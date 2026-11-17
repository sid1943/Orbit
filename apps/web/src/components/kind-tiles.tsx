import type { SyncItem } from "@orbit/core";
import { useState } from "react";
import { Link } from "react-router";
import { useKinds } from "../api/queries.js";
import { kindSlug, kindTiles } from "../lib/kinds.js";
import { AddKindDialog } from "./add-kind-dialog.js";
import { kindStyle } from "./kind-chip.js";

/**
 * Big square kind tiles with counts; each opens its kind page. `current` marks the kind being viewed.
 * With `canAdd`, a square "+" tile at the end adds a kind.
 */
export function KindTiles({
  items,
  current,
  canAdd = false,
}: {
  items: readonly SyncItem[];
  current?: string;
  canAdd?: boolean;
}) {
  const kinds = useKinds().data ?? [];
  const [adding, setAdding] = useState(false);
  return (
    <>
      <nav className="kind-tiles" aria-label="Kinds">
        {kindTiles(items, kinds).map(({ kind, count }) => (
          <Link
            key={kind}
            to={current === kind ? "/all" : `/kind/${kindSlug(kind)}`}
            className={`kind-tile${current === kind ? " on" : ""}`}
            aria-current={current === kind ? "page" : undefined}
            style={kindStyle(kind, kinds)}
          >
            <span className="label">
              <i className="dot" aria-hidden="true" />
              {kind}
            </span>
            <span className="value">{count.toLocaleString()}</span>
          </Link>
        ))}
        {canAdd && (
          <button type="button" className="kind-tile add" onClick={() => setAdding(true)} aria-label="Add a kind">
            <span className="plus" aria-hidden="true">
              +
            </span>
            <span className="label">New kind</span>
          </button>
        )}
      </nav>
      {adding && <AddKindDialog onClose={() => setAdding(false)} />}
    </>
  );
}
