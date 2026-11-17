import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { useItemSummaries, usePrefs } from "../api/queries.js";
import { ItemList } from "../components/item-list.js";
import { PageBar } from "../components/page-bar.js";
import { listItems } from "../lib/list.js";
import { searchItems } from "../lib/search.js";

/** Search results (`/search?q=`): title matches first, then cards matching on topics or details. */
export function Search() {
  const q = useSearchParams()[0].get("q") ?? "";
  const items = useItemSummaries();
  const showArchived = usePrefs().data?.lists.showArchived ?? false;
  const found = useMemo(
    () => (items.data ? searchItems(listItems(items.data, { status: "all", showArchived }), q) : []),
    [items.data, q, showArchived],
  );

  return (
    <>
      <PageBar
        title={q.trim() ? `“${q.trim()}”` : "Search"}
        sub={items.data && q.trim() ? `${found.length.toLocaleString()} found` : undefined}
      />
      {!q.trim() ? (
        <div className="pad muted">Type in the search bar to find any card.</div>
      ) : items.data ? (
        <ItemList items={found} group="none" empty="Nothing matches. Try another word." />
      ) : (
        items.isPending && !items.isError && <div className="pad muted">Loading your cards…</div>
      )}
    </>
  );
}
