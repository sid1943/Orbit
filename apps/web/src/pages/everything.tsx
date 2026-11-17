import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router";
import { useItemSummaries, useKinds, usePrefs } from "../api/queries.js";
import { ItemList } from "../components/item-list.js";
import { KindTiles } from "../components/kind-tiles.js";
import { PageBar } from "../components/page-bar.js";
import { Segmented } from "../components/segmented.js";
import { kindFromSlug } from "../lib/kinds.js";
import { GROUPS, STATUS_FILTERS, listItems, parseGroup, parseStatus } from "../lib/list.js";
import { NotFound } from "./not-found.js";

/** "Movie" → "Movies", "Show" → "Shows"; kinds already ending in s stay as they are. */
const plural = (kind: string) => (kind.endsWith("s") ? kind : `${kind}s`);

/**
 * Everything (`/all`) and one kind's page (`/kind/:kind`): kind tiles, a status filter and grouping
 * (kept in the address, so Back and links keep them), then the rows.
 */
export function Everything() {
  const slug = useParams().kind;
  const kindsQuery = useKinds();
  const kind = slug ? kindFromSlug(slug, kindsQuery.data) : undefined;
  const [params, setParams] = useSearchParams();
  const status = parseStatus(params.get("status"));
  const group = parseGroup(params.get("group"));
  const items = useItemSummaries();
  const showArchived = usePrefs().data?.lists.showArchived ?? false;
  const list = useMemo(
    () => (items.data ? listItems(items.data, { kind, status, showArchived }) : []),
    [items.data, kind, status, showArchived],
  );

  // A custom kind's page waits for the kind list rather than flashing "not found".
  if (slug && !kind) return kindsQuery.isPlaceholderData ? null : <NotFound />;

  const set = (key: string, value: string, empty: string) =>
    setParams(
      (p) => {
        if (value === empty) p.delete(key);
        else p.set(key, value);
        return p;
      },
      { replace: true },
    );

  return (
    <>
      <PageBar
        title={kind ? plural(kind) : "Everything"}
        sub={items.data ? `${list.length.toLocaleString()} shown` : undefined}
      >
        <Segmented label="Status" value={status} options={STATUS_FILTERS} onChange={(v) => set("status", v, "all")} />
        {!kind && (
          <Segmented label="Group by" value={group} options={GROUPS} onChange={(v) => set("group", v, "none")} />
        )}
      </PageBar>
      {items.data ? (
        <>
          <div className="pad tiles-pad">
            <KindTiles items={items.data} current={kind} canAdd={!kind} />
          </div>
          <ItemList
            key={`${kind ?? ""}|${status}|${group}`}
            items={list}
            group={kind ? "none" : group}
            empty="Nothing matches. Try another status, or turn on archived cards in Settings → Lists."
          />
        </>
      ) : (
        items.isPending && !items.isError && <div className="pad muted">Loading your cards…</div>
      )}
    </>
  );
}
