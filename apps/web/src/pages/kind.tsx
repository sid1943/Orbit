import { useMemo } from "react";
import { Navigate, useLocation, useParams } from "react-router";
import { useItemSummaries, useKinds } from "../api/queries.js";
import { AllCardsView } from "../components/all-cards-view.js";
import { KindTiles } from "../components/kind-tiles.js";
import { PageBar } from "../components/page-bar.js";
import { kindFromSlug } from "../lib/kinds.js";
import { NotFound } from "./not-found.js";

/** "Movie" → "Movies", "Show" → "Shows"; kinds already ending in s stay as they are. */
const plural = (kind: string) => (kind.endsWith("s") ? kind : `${kind}s`);

/** One kind's page (`/kind/:kind`): the kind tiles, then that kind's cards with the same Filters as All cards. */
export function KindPage() {
  const slug = useParams().kind ?? "";
  const kindsQuery = useKinds();
  const kind = kindFromSlug(slug, kindsQuery.data);
  const items = useItemSummaries();
  const count = useMemo(
    () => (kind && items.data ? items.data.filter((i) => i.kind === kind && !i.deleted && !i.archived).length : null),
    [items.data, kind],
  );

  // A custom kind's page waits for the kind list rather than flashing "not found".
  if (!kind) return kindsQuery.isPlaceholderData ? null : <NotFound />;

  return (
    <>
      <PageBar title={plural(kind)} sub={count !== null ? `${count.toLocaleString()} cards` : undefined} />
      {items.data && (
        <div className="pad tiles-pad">
          <KindTiles items={items.data} current={kind} />
        </div>
      )}
      <AllCardsView kind={kind} />
    </>
  );
}

/** The old Everything page (`/all`): now Today's All cards view, keeping any filters in the address. */
export function EverythingRedirect() {
  const { search } = useLocation();
  const p = new URLSearchParams(search);
  p.set("all", "1");
  return <Navigate to={`/?${p.toString()}`} replace />;
}
