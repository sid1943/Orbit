import { STATUS_LABELS, type Status } from "@orbit/core";
import type { CSSProperties } from "react";
import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router";
import { useItemSummaries, useKinds, usePrefs } from "../api/queries.js";
import { ItemList } from "../components/item-list.js";
import { kindStyle } from "../components/kind-chip.js";
import { PageBar } from "../components/page-bar.js";
import { Segmented } from "../components/segmented.js";
import { TopicChip } from "../components/topic-chip.js";
import { STATUS_FILTERS, parseStatus } from "../lib/list.js";
import { topicPage } from "../lib/topic-map.js";

/** Colours for the status bar, as in Orbit today. */
const STATUS_COLOURS: Record<Status, string> = {
  todo: "var(--muted)",
  doing: "var(--accent)",
  done: "var(--good)",
  dropped: "var(--bad)",
};

/**
 * One topic (`/topic/:name`): everything sharing it across every kind. Kind chips and the status filter (in the
 * address) narrow the list; the bar shows how far along the topic is; connected topics share its cards.
 */
export function TopicPage() {
  const key = decodeURIComponent(useParams().name ?? "").toLowerCase();
  const [params, setParams] = useSearchParams();
  const kind = params.get("kind");
  const status = parseStatus(params.get("status"));
  const items = useItemSummaries();
  const kinds = useKinds().data;
  const showArchived = usePrefs().data?.lists.showArchived ?? false;
  const page = useMemo(
    () => (items.data ? topicPage(items.data, key, { kind, status, showArchived }) : null),
    [items.data, key, kind, status, showArchived],
  );

  const set = (k: string, v: string | null) =>
    setParams(
      (p) => {
        if (v === null) p.delete(k);
        else p.set(k, v);
        return p;
      },
      { replace: true },
    );

  if (!page) return items.isPending && !items.isError ? <div className="pad muted">Loading your cards…</div> : null;
  const total = page.all.length;

  return (
    <>
      <PageBar
        title={`#${page.name ?? key}`}
        sub={
          total
            ? `${total.toLocaleString()} thing${total === 1 ? "" : "s"} across ${page.kindCounts.length} kind${
                page.kindCounts.length === 1 ? "" : "s"
              }`
            : undefined
        }
      >
        <Segmented
          label="Status"
          value={status}
          options={STATUS_FILTERS}
          onChange={(v) => set("status", v === "all" ? null : v)}
        />
      </PageBar>
      {!total ? (
        <div className="pad empty">No cards have #{key} yet.</div>
      ) : (
        <>
          <div className="pad topic-head">
            <div className="topic-kinds" role="group" aria-label="Kind">
              <button
                type="button"
                className={`chip${!kind ? " on" : ""}`}
                aria-pressed={!kind}
                onClick={() => set("kind", null)}
              >
                All kinds
              </button>
              {page.kindCounts.map((k) => (
                <button
                  key={k.kind}
                  type="button"
                  className={`chip kind-pick${kind === k.kind ? " on" : ""}`}
                  aria-pressed={kind === k.kind}
                  style={kindStyle(k.kind, kinds)}
                  onClick={() => set("kind", kind === k.kind ? null : k.kind)}
                >
                  <i className="dot" aria-hidden="true" />
                  {k.kind} <span className="n">{k.count.toLocaleString()}</span>
                </button>
              ))}
            </div>
            <div className="topic-stack" aria-hidden="true">
              {page.statusCounts.map((s) => (
                <i
                  key={s.status}
                  style={
                    { width: `${(s.count / total) * 100}%`, background: STATUS_COLOURS[s.status] } as CSSProperties
                  }
                />
              ))}
            </div>
            <div className="topic-legend">
              {page.statusCounts.map((s) => (
                <span key={s.status}>
                  <i className="dot" style={{ background: STATUS_COLOURS[s.status] }} aria-hidden="true" />
                  {STATUS_LABELS[s.status]} {s.count.toLocaleString()}
                </span>
              ))}
            </div>
            {page.connected.length > 0 && (
              <section className="topic-connected" aria-labelledby="topic-connected">
                <div className="sec-head">
                  <h2 id="topic-connected">Connected topics</h2>
                  <span className="note">topics that show up on the same things</span>
                </div>
                <div className="cloud">
                  {page.connected.map((t) => (
                    <TopicChip key={t.key} name={t.name} count={t.count} />
                  ))}
                </div>
              </section>
            )}
          </div>
          <ItemList
            key={`${key}|${kind ?? ""}|${status}`}
            items={page.list}
            group="none"
            empty="Nothing with this topic matches. Try All kinds or another status."
          />
        </>
      )}
    </>
  );
}
