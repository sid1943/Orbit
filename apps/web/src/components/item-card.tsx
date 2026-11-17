import type { SyncItem } from "@orbit/core";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { KindChip } from "./kind-chip.js";

/** A card tile (Closest to finished, Pick one today): kind, title, then whatever goes under it. */
export function ItemCard({ item, children }: { item: SyncItem; children?: ReactNode }) {
  return (
    <Link className="card" to={`/item/${encodeURIComponent(item.id)}`}>
      <KindChip kind={item.kind} />
      <span className="tt">{item.title}</span>
      {children}
    </Link>
  );
}
