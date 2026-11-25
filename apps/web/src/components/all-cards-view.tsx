import { topicCounts } from "@orbit/core";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useItemSummaries, useKinds, usePlaces, usePrefs } from "../api/queries.js";
import { activeFilterCount, allCards, kindChoices, readFilters, topicChoices, writeFilters } from "../lib/all-cards.js";
import { CardFiltersPanel } from "./card-filters.js";
import { ItemList } from "./item-list.js";

/**
 * Every card with the Filters button and panel, filters kept in the address. On Today it is the
 * "All cards" view; on a kind page `kind` fixes the kind.
 */
export function AllCardsView({ kind }: { kind?: string }) {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => {
    const f = readFilters(params);
    return kind ? { ...f, kind, group: "none" as const } : f;
  }, [params, kind]);
  const items = useItemSummaries();
  const kinds = useKinds().data;
  const prefs = usePrefs().data;
  const loc = prefs?.location;
  const here = useMemo(
    () => (loc?.lat !== undefined && loc.lng !== undefined ? { lat: loc.lat, lng: loc.lng } : null),
    [loc],
  );
  const places = usePlaces().data?.places;
  const showArchived = prefs?.lists.showArchived ?? false;
  const active = activeFilterCount(kind ? { ...filters, kind: null } : filters);
  const [open, setOpen] = useState(active > 0);

  const result = useMemo(
    () =>
      items.data
        ? allCards(items.data, filters, {
            showArchived,
            ...(places ? { places } : {}),
            here,
          })
        : null,
    [items.data, filters, showArchived, places, here],
  );
  const topics = useMemo(
    () => (items.data ? topicChoices(topicCounts(items.data.filter((c) => !c.deleted))) : []),
    [items.data],
  );
  const kindNames = useMemo(
    () =>
      items.data
        ? kindChoices(
            items.data,
            kinds?.map((k) => k.name),
          )
        : [],
    [items.data, kinds],
  );

  if (!items.data || !result) {
    return items.isPending && !items.isError ? <p className="muted pad">Loading your cards…</p> : null;
  }

  return (
    <div className="all-cards">
      <div className="all-bar">
        <button
          type="button"
          className={`btn filters-btn${open ? " on" : ""}`}
          aria-expanded={open}
          aria-controls="all-filters"
          onClick={() => setOpen((o) => !o)}
        >
          Filters{active > 0 && <span className="count">{active}</span>}
        </button>
        <span className="muted">
          {result.items.length.toLocaleString()} {result.items.length === 1 ? "card" : "cards"}
        </span>
      </div>
      {open && (
        <div id="all-filters">
          <CardFiltersPanel
            value={filters}
            onChange={(f) => setParams((p) => writeFilters(p, kind ? { ...f, kind: null } : f), { replace: true })}
            kinds={kind ? null : kindNames}
            topics={topics}
            hasLocation={!!here}
            showGroup={!kind}
          />
        </div>
      )}
      <ItemList
        key={params.toString()}
        items={result.items}
        group={filters.group}
        miles={result.miles}
        empty="Nothing matches these filters. Try fewer, or Clear filters."
      />
    </div>
  );
}
