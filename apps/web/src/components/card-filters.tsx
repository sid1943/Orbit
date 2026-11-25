import type { TopicCount } from "@orbit/core";
import { GROUPS, STATUS_FILTERS } from "../lib/list.js";
import {
  NO_FILTERS,
  SORT_OPTIONS,
  WHEN_OPTIONS,
  WITHIN_OPTIONS,
  type CardFilters as Filters,
} from "../lib/all-cards.js";
import { useOpenLocation } from "../lib/location-panel.js";
import { Segmented } from "./segmented.js";

/**
 * The All cards filters: status, kind, topic, distance, when, archived, grouping and sort order.
 * `kinds` null hides the kind choice (a kind page is already one kind).
 */
export function CardFiltersPanel({
  value,
  onChange,
  kinds,
  topics,
  hasLocation,
  showGroup = true,
}: {
  value: Filters;
  onChange: (f: Filters) => void;
  kinds: readonly string[] | null;
  topics: readonly TopicCount[];
  hasLocation: boolean;
  showGroup?: boolean;
}) {
  const openLocation = useOpenLocation();
  const set = (change: Partial<Filters>) => onChange({ ...value, ...change });
  const topicName = topics.find((t) => t.key === value.topic)?.name ?? value.topic ?? "";

  return (
    <div className="all-filters" role="group" aria-label="Filters">
      <div className="all-filter">
        <span className="all-filter-label">Status</span>
        <Segmented label="Status" value={value.status} options={STATUS_FILTERS} onChange={(v) => set({ status: v })} />
      </div>

      {kinds && (
        <label className="all-filter">
          <span className="all-filter-label">Kind</span>
          <select className="input" value={value.kind ?? ""} onChange={(e) => set({ kind: e.target.value || null })}>
            <option value="">Every kind</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="all-filter">
        <span className="all-filter-label">Topic</span>
        <input
          className="input"
          list="all-topics"
          defaultValue={topicName}
          key={value.topic ?? ""}
          placeholder="Any topic"
          onChange={(e) => {
            const v = e.target.value.trim().toLowerCase();
            const hit = topics.find((t) => t.key === v);
            if (hit) set({ topic: hit.key });
            else if (!v) set({ topic: null });
          }}
        />
        <datalist id="all-topics">
          {topics.map((t) => (
            <option key={t.key} value={t.name}>
              {t.count} cards
            </option>
          ))}
        </datalist>
      </label>

      <div className="all-filter">
        <span className="all-filter-label">Distance</span>
        {hasLocation ? (
          <Segmented
            label="Distance"
            value={value.within}
            options={WITHIN_OPTIONS}
            onChange={(v) => set({ within: v })}
          />
        ) : (
          <button type="button" className="btn small" onClick={() => openLocation()}>
            Set my location to filter by distance
          </button>
        )}
      </div>

      <div className="all-filter">
        <span className="all-filter-label">When</span>
        <Segmented label="When" value={value.when} options={WHEN_OPTIONS} onChange={(v) => set({ when: v })} />
      </div>

      {showGroup && (
        <div className="all-filter">
          <span className="all-filter-label">Group</span>
          <Segmented label="Group by" value={value.group} options={GROUPS} onChange={(v) => set({ group: v })} />
        </div>
      )}

      <div className="all-filter">
        <span className="all-filter-label">Sort</span>
        <Segmented
          label="Sort"
          value={value.sort}
          options={hasLocation ? SORT_OPTIONS : SORT_OPTIONS.filter((o) => o.value !== "near")}
          onChange={(v) => set({ sort: v })}
        />
      </div>

      <div className="all-filter-foot">
        <label className="all-check">
          <input type="checkbox" checked={value.archived} onChange={(e) => set({ archived: e.target.checked })} />
          Show archived
        </label>
        <button type="button" className="link-btn" onClick={() => onChange(NO_FILTERS)}>
          Clear filters
        </button>
      </div>
    </div>
  );
}
