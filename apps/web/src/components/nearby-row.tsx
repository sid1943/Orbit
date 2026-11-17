import { Link } from "react-router";
import { placeDistance, placeMapLink, type NearbyOnCard } from "../lib/near-you.js";
import { KindChip } from "./kind-chip.js";

/**
 * One place on your lists: how far it is, its name, the card it's on, and a Map link. The row opens the card.
 * A place with no exact spot is measured to its city's center ("in San Jose", "~40 mi").
 */
export function NearbyRow({ place }: { place: NearbyOnCard }) {
  const onList = place.place.checklist !== null;
  return (
    <div className={`row place-row${place.done ? " done" : ""}`}>
      <span className="dist" title={place.approx ? "No exact spot: measured to the city center" : undefined}>
        {placeDistance(place)}
      </span>
      <div className="row-main">
        <Link className="tt" to={`/item/${encodeURIComponent(place.card.id)}`}>
          {place.label}
        </Link>
        <div className="meta">
          {place.done && <span className="src">done</span>}
          {onList ? <span className="src">on {place.card.title}</span> : <KindChip kind={place.card.kind} />}
        </div>
      </div>
      <a className="chip" href={placeMapLink(place)} target="_blank" rel="noreferrer" title="Open in Google Maps">
        Map
      </a>
    </div>
  );
}
