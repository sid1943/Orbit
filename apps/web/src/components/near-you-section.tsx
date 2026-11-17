import { formatMiles } from "@orbit/core";
import { useMemo } from "react";
import { Link } from "react-router";
import { useItemSummaries, usePlaces, usePrefs } from "../api/queries.js";
import { useOpenLocation } from "../lib/location-panel.js";
import { nearYou, placesWithSpot } from "../lib/near-you.js";
import { NearbyRow } from "./nearby-row.js";
import { Section } from "./section.js";

/** Today's Near you: the closest places on your lists you haven't done, or a prompt to set your location. */
export function NearYouSection() {
  const prefs = usePrefs();
  const places = usePlaces();
  const cards = useItemSummaries();
  const openLocation = useOpenLocation();
  const loc = prefs.data?.location;
  const showArchived = prefs.data?.lists.showArchived ?? false;
  const here = useMemo(
    () => (loc?.lat !== undefined && loc.lng !== undefined ? { lat: loc.lat, lng: loc.lng } : null),
    [loc],
  );
  const near = useMemo(
    () => (here && places.data && cards.data ? nearYou(places.data.places, cards.data, here, showArchived) : null),
    [here, places.data, cards.data, showArchived],
  );

  if (!here) {
    const count = places.data && cards.data ? placesWithSpot(places.data.places, cards.data, showArchived) : null;
    return (
      <Section title="Near you" note="distances need your location">
        <div className="prompt">
          {count !== null
            ? `Orbit can sort ${count.toLocaleString()} places on your lists by how far they are from you.`
            : "Orbit can sort the places on your lists by how far they are from you."}
          <button type="button" className="btn primary" onClick={() => openLocation()}>
            Set my location
          </button>
        </div>
      </Section>
    );
  }

  const towns = near?.towns.map((t) => (
    <Link key={t.city} className="btn small" to="/near?within=25">
      + {t.count} thing{t.count > 1 ? "s" : ""} to do in {t.city} →
    </Link>
  ));

  return (
    <Section
      title="Near you"
      note={!near ? "finding places…" : near.close.length ? "closest things you haven't done" : "nothing within 100 mi"}
      action={
        <Link className="btn small" to="/near">
          All nearby →
        </Link>
      }
    >
      {places.isError && (
        <p className="error" role="alert">
          Couldn&apos;t load the places on your lists.
        </p>
      )}
      {near && near.close.length > 0 && (
        <div className="list">
          {near.close.map((p) => (
            <NearbyRow key={`${p.place.itemId}:${p.place.checklist ?? ""}:${p.place.row ?? ""}`} place={p} />
          ))}
        </div>
      )}
      {towns && towns.length > 0 && <div className="towns">{towns}</div>}
      {near && !near.close.length && !towns?.length && near.closest && (
        <p className="muted">
          Closest on your lists:{" "}
          <Link to={`/item/${encodeURIComponent(near.closest.card.id)}`}>{near.closest.label}</Link>,{" "}
          {formatMiles(near.closest.miles)} away.
        </p>
      )}
    </Section>
  );
}
