import { formatMiles } from "@orbit/core";
import { Link } from "react-router";
import type { NearbyOnCard } from "../lib/near-you.js";
import { KindChip } from "./kind-chip.js";

/** One place on your lists: its name, the card it's on, and how far it is. Opens the card. */
export function NearbyRow({ place }: { place: NearbyOnCard }) {
  const onList = place.place.checklist !== null;
  return (
    <div className="row place-row">
      <span className="dist">{place.approx ? `in ${place.city}` : formatMiles(place.miles)}</span>
      <div className="row-main">
        <Link className="tt" to={`/item/${encodeURIComponent(place.card.id)}`}>
          {place.label}
        </Link>
        <div className="meta">
          {onList ? <span className="src">on {place.card.title}</span> : <KindChip kind={place.card.kind} />}
        </div>
      </div>
    </div>
  );
}
