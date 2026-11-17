import type { SyncItem } from "@orbit/core";
import { useState, type ReactNode } from "react";
import { groupItems, type GroupBy, type ListGroup } from "../lib/list.js";
import { ItemRow } from "./item-row.js";
import { kindStyle } from "./kind-chip.js";

const PAGE = 200;

/** A long list of cards, flat or grouped, shown 200 at a time. */
export function ItemList({ items, group, empty }: { items: readonly SyncItem[]; group: GroupBy; empty: ReactNode }) {
  const [limit, setLimit] = useState(PAGE);
  if (!items.length) return <div className="empty">{empty}</div>;

  const groups: (ListGroup & { shown: SyncItem[] })[] = [];
  for (const g of groupItems(items, group)) {
    const room = limit - groups.reduce((n, x) => n + x.shown.length, 0);
    if (room <= 0) break;
    groups.push({ ...g, shown: g.items.slice(0, room) });
  }

  return (
    <div className="item-list">
      {groups.map((g) => (
        <div key={g.label || "all"}>
          {g.label && (
            <div className="group-head sticky" style={g.kind ? kindStyle(g.kind) : undefined}>
              {g.kind && <i className="dot" aria-hidden="true" />}
              {g.label} · {g.items.length.toLocaleString()}
            </div>
          )}
          <div className="rows">
            {g.shown.map((i) => (
              <ItemRow key={i.id} item={i} />
            ))}
          </div>
        </div>
      ))}
      {items.length > limit && (
        <div className="more">
          <button type="button" className="btn" onClick={() => setLimit((n) => n + PAGE * 5)}>
            Show more ({(items.length - limit).toLocaleString()} left)
          </button>
        </div>
      )}
    </div>
  );
}
