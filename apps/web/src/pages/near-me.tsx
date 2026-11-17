import { formatMiles } from "@orbit/core";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useItemSummaries, usePlaces, usePrefs } from "../api/queries.js";
import { NearbyRow } from "../components/nearby-row.js";
import { PageBar } from "../components/page-bar.js";
import { Segmented } from "../components/segmented.js";
import { useOpenLocation } from "../lib/location-panel.js";
import { RADIUS_OPTIONS, nearMe, parseRadius, type Radius } from "../lib/near-me.js";
import type { NearbyOnCard } from "../lib/near-you.js";

const PAGE = 150;
const rowKey = (p: NearbyOnCard) => `${p.place.itemId}:${p.place.checklist ?? ""}:${p.place.row ?? ""}`;

/**
 * Near me (`/near`): places on your lists by distance from where you are. Distance, Show done and the category
 * chip live in the address. Places with an exact spot come first, then places known only by their city.
 */
export function NearMe() {
  const [params, setParams] = useSearchParams();
  const radius = parseRadius(params.get("within"));
  const showDone = params.get("done") === "1";
  const category = params.get("cat");
  const prefs = usePrefs();
  const places = usePlaces();
  const cards = useItemSummaries();
  const openLocation = useOpenLocation();
  const [limit, setLimit] = useState(PAGE);
  const loc = prefs.data?.location;
  const here = useMemo(
    () => (loc?.lat !== undefined && loc.lng !== undefined ? { lat: loc.lat, lng: loc.lng } : null),
    [loc],
  );
  const showArchived = prefs.data?.lists.showArchived ?? false;
  const near = useMemo(
    () =>
      here && places.data && cards.data
        ? nearMe(places.data.places, cards.data, here, { radius, showDone, category, showArchived })
        : null,
    [here, places.data, cards.data, radius, showDone, category, showArchived],
  );

  const set = (key: string, value: string | null) => {
    setLimit(PAGE);
    setParams(
      (p) => {
        if (value === null) p.delete(key);
        else p.set(key, value);
        return p;
      },
      { replace: true },
    );
  };

  const within = radius === "any" ? "" : `within ${radius} mi`;
  const where = loc?.label ?? "you";
  const sub = !here
    ? "Set your location to see what's close"
    : near
      ? `${near.count.toLocaleString()} place${near.count === 1 ? "" : "s"} ${
          within ? `${within} of ${where}` : `on your lists, closest to ${where} first`
        }`
      : undefined;

  return (
    <>
      <PageBar title="Near me" sub={sub}>
        <Segmented<Radius>
          label="Distance"
          value={radius}
          options={RADIUS_OPTIONS}
          onChange={(v) => set("within", v === 100 ? null : String(v))}
        />
        <div className="seg">
          <button
            type="button"
            aria-pressed={showDone}
            className={showDone ? "on" : undefined}
            onClick={() => set("done", showDone ? null : "1")}
          >
            Show done
          </button>
        </div>
      </PageBar>
      {!here ? (
        <div className="pad">
          <div className="prompt">
            Orbit sorts the places on your lists by distance once it knows where you are.
            <button type="button" className="btn primary" onClick={() => openLocation()}>
              Set my location
            </button>
          </div>
        </div>
      ) : places.isError ? (
        <div className="pad">
          <p className="error" role="alert">
            Couldn&apos;t load the places on your lists.
          </p>
        </div>
      ) : !near ? (
        <div className="pad muted">Finding places…</div>
      ) : (
        <>
          <div className="pad near-facets" role="group" aria-label="Category">
            <button
              type="button"
              className={`chip${near.category === null ? " on" : ""}`}
              aria-pressed={near.category === null}
              onClick={() => set("cat", null)}
            >
              All <span className="n">{near.inRange.toLocaleString()}</span>
            </button>
            {near.categories.map((c) => (
              <button
                key={c.category}
                type="button"
                className={`chip${near.category === c.category ? " on" : ""}`}
                aria-pressed={near.category === c.category}
                onClick={() => set("cat", c.category)}
              >
                {c.label} <span className="n">{c.count.toLocaleString()}</span>
              </button>
            ))}
          </div>
          {near.count === 0 ? (
            <p className="empty">
              Nothing on your lists {radius === "any" ? "yet" : within}.
              {near.closest && (
                <>
                  {" "}
                  Closest: <Link to={`/item/${encodeURIComponent(near.closest.card.id)}`}>
                    {near.closest.label}
                  </Link>, {formatMiles(near.closest.miles)}.
                </>
              )}
            </p>
          ) : (
            <div className="near-list">
              {near.exact.length > 0 && (
                <div className="rows">
                  {near.exact.slice(0, limit).map((p) => (
                    <NearbyRow key={rowKey(p)} place={p} />
                  ))}
                </div>
              )}
              {near.exact.length > limit && (
                <div className="more">
                  <button type="button" className="btn" onClick={() => setLimit((n) => n + PAGE)}>
                    Show more ({(near.exact.length - limit).toLocaleString()} left)
                  </button>
                </div>
              )}
              {near.cities.map((g) => (
                <section key={g.city} aria-label={`In ${g.city}`}>
                  <div className="group-head near-city-head">
                    In {g.city} · {g.places.length.toLocaleString()} · no exact spot yet,{" "}
                    {g.miles < 1 ? "under a mile" : formatMiles(g.miles)} to the city center
                  </div>
                  <div className="rows">
                    {g.places.map((p) => (
                      <NearbyRow key={rowKey(p)} place={p} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
