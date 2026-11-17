import { daysUntil, formatMiles, inSeason, timeInfo, type SyncItem } from "@orbit/core";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { shortDate } from "../lib/dates.js";
import { KindChip } from "./kind-chip.js";
import { ProgressBar } from "./progress-bar.js";
import { StatusCheck } from "./status-check.js";
import { TopicChip } from "./topic-chip.js";

/** "in 3 days" or "in season", when a card is dated and it's soon or now. */
function WhenChip({ item }: { item: SyncItem }) {
  const ti = timeInfo(item);
  if (!ti) return null;
  if (ti.next) {
    const n = daysUntil(ti.next);
    if (n === 0) return <span className="chip when now">today</span>;
    if (n <= 90) return <span className="chip when">in {n === 1 ? "1 day" : `${n} days`}</span>;
  }
  return inSeason(ti) ? <span className="chip when now">in season</span> : null;
}

/**
 * One card in a list: status box, title, kind, topics, and on the right distance, checklist progress
 * and due date. `right` replaces the right side (Coming up shows the date there).
 */
export function ItemRow({
  item,
  miles,
  right,
  note,
  todo = false,
}: {
  item: SyncItem;
  miles?: number;
  right?: ReactNode;
  note?: ReactNode;
  todo?: boolean;
}) {
  return (
    <div className={`row ${item.status}${todo ? " todo" : ""}`}>
      <StatusCheck id={item.id} status={item.status} todo={todo} />
      <div className="row-main">
        <Link className="tt" to={`/item/${encodeURIComponent(item.id)}`}>
          {item.title}
        </Link>
        <div className="meta">
          {!todo && <KindChip kind={item.kind} />}
          {note && <span className="src">{note}</span>}
          {!note && <WhenChip item={item} />}
          {item.due && todo && <span className="chip when">due {shortDate(new Date(`${item.due}T00:00:00`))}</span>}
          {!todo && item.tags.slice(0, 4).map((t) => <TopicChip key={t} name={t} />)}
          {item.archived && <span className="chip">archived</span>}
        </div>
      </div>
      <div className="right">
        {right ?? (
          <>
            {miles !== undefined && <span className="dist">{formatMiles(miles)}</span>}
            {item.total > 0 && (
              <>
                <ProgressBar done={item.done} total={item.total} />
                <span>
                  {item.done}/{item.total}
                </span>
              </>
            )}
            {item.due && !todo && <span>{item.due}</span>}
          </>
        )}
      </div>
    </div>
  );
}
