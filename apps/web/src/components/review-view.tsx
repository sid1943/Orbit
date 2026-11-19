import { categoryLabel } from "@orbit/core";
import { usePendingReview } from "../api/queries.js";

/**
 * Review, a side of Center Base's switch (`?review=1`), there only while link guesses are waiting. A guess waits
 * when the matcher found a likely match but wasn't sure (`confidence: "review"`) and Sid hasn't answered it.
 * This lists them; answering (Correct, Wrong, Delete) and Fix links come with job W5.
 */
export function ReviewView() {
  const pending = usePendingReview();

  if (pending.isPending) return <p className="muted review-view">Looking for link guesses…</p>;
  if (pending.isError)
    return (
      <p className="error review-view" role="alert">
        Couldn&apos;t load the link guesses.
      </p>
    );
  const list = pending.data;
  if (!list.length) return <p className="empty review-view">Nothing to review. Every link guess has an answer.</p>;

  return (
    <div className="review-view">
      <p className="muted review-note">
        {list.length.toLocaleString()} link guess{list.length === 1 ? "" : "es"} waiting. Orbit found a likely match for
        each but wasn&apos;t sure. Answering them (Correct, Wrong, Delete) comes with the Review job (W5).
      </p>
      <div className="list">
        {list.map((e) => (
          <div key={e.id} className="row review-row">
            <span className="chip">{categoryLabel(e.category)}</span>
            <div className="row-main">
              <span className="tt">{e.label ?? e.name}</span>
              {(e.description || e.year || e.author) && (
                <div className="meta">
                  <span className="src">{[e.description, e.author, e.year].filter(Boolean).join(" · ")}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
