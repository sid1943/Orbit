import { useParams } from "react-router";
import { PageBar } from "../components/page-bar.js";
import { useItemSummaries } from "../api/queries.js";
import { kindFromSlug } from "../lib/kinds.js";
import { NotFound } from "./not-found.js";

/** One kind's list. Step 1 shows the count; the list itself comes with Everything in step 2. */
export function KindPage() {
  const kind = kindFromSlug(useParams().kind ?? "");
  const items = useItemSummaries();
  if (!kind) return <NotFound />;
  const count = items.data?.filter((i) => i.kind === kind && !i.deleted && !i.archived).length;
  return (
    <>
      <PageBar title={kind} sub={count !== undefined ? `${count.toLocaleString()} cards` : undefined} />
      <div className="pad muted">The list arrives in build step 2.</div>
    </>
  );
}
