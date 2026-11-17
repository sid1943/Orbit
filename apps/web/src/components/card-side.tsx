import { addTopics, daysUntil, inSeason, MONTHS, removeTopic, timeInfo, type Item, type SyncItem } from "@orbit/core";
import { Link } from "react-router";
import type { ItemEditFields } from "../api/client.js";
import { relativeDays, shortDate } from "../lib/dates.js";
import { AddBox } from "./add-box.js";
import { kindStyle } from "./kind-chip.js";

function Topics({ tags, save }: { tags: string[]; save: (f: ItemEditFields) => void }) {
  return (
    <section className="card-sec">
      <h3>Topics</h3>
      <div className="cloud">
        {tags.map((t) => (
          <span className="chip topic-edit" key={t}>
            <Link to={`/topic/${encodeURIComponent(t.toLowerCase())}`}>#{t}</Link>
            <button
              type="button"
              className="x-btn"
              aria-label={`Remove ${t}`}
              onClick={() => save({ tags: removeTopic(tags, t) })}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <AddBox label="+ topic" list="all-topics" onAdd={(t) => save({ tags: addTopics(tags, t) })} />
    </section>
  );
}

function Details({ item, save }: { item: Item; save: (f: ItemEditFields) => void }) {
  const due = item.due?.slice(0, 10) ?? "";
  const props = Object.entries(item.props);
  return (
    <section className="card-sec">
      <h3>Details</h3>
      <div className="due-box">
        <label htmlFor="card-due" className="muted">
          Due
        </label>
        <input id="card-due" type="date" value={due} onChange={(e) => save({ due: e.target.value || null })} />
        {due && (
          <>
            <span className="muted">{relativeDays(daysUntil(new Date(`${due}T00:00:00`)))}</span>
            <button type="button" className="btn small" onClick={() => save({ due: null })}>
              Clear
            </button>
          </>
        )}
      </div>
      {(props.length > 0 || item.start) && (
        <dl className="props">
          {item.start && (
            <div className="prop">
              <dt>Start</dt>
              <dd>{item.start}</dd>
            </div>
          )}
          {props.map(([k, v]) => (
            <div key={k} className="prop">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function When({ item }: { item: Item }) {
  const ti = timeInfo(item);
  if (!ti) return null;
  const n = ti.next ? daysUntil(ti.next) : null;
  const some = ti.months.size > 0 && ti.months.size < 12;
  const thisMonth = new Date().getMonth();
  return (
    <section className="card-sec">
      <h3>When</h3>
      <div className="when-box">
        <div>{ti.text}</div>
        {ti.next && n !== null && (
          <div>
            <b className="when-d">{relativeDays(n).replace(/^./, (c) => c.toUpperCase())}</b> · {shortDate(ti.next)}
          </div>
        )}
        {some && (
          <>
            <div className="months" aria-label="Months">
              {MONTHS.map((m, i) => (
                <span key={m} className={`${ti.months.has(i) ? "on" : ""}${i === thisMonth ? " cur" : ""}`} title={m}>
                  {m[0]!.toUpperCase()}
                </span>
              ))}
            </div>
            <div className="muted small-text">
              {inSeason(ti) ? "Good time to go: it's in season now." : "Not in season this month."}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/** Other cards, each with its kind's colour and a short reason. */
function Connections({ title, rows }: { title: string; rows: { card: SyncItem; why: string }[] }) {
  if (!rows.length) return null;
  return (
    <section className="card-sec">
      <h3>{title}</h3>
      <div className="conn">
        {rows.map(({ card, why }) => (
          <Link key={card.id} to={`/item/${encodeURIComponent(card.id)}`} style={kindStyle(card.kind)}>
            <i className="dot" aria-hidden="true" />
            <span className="conn-title">{card.title}</span>
            <span className="muted small-text">{why}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** The side column: topics, details, when, and the cards this one connects to. */
export function CardSide({
  item,
  save,
  linksTo,
  related,
}: {
  item: Item;
  save: (f: ItemEditFields) => void;
  linksTo: SyncItem[];
  related: { card: SyncItem; topics: string[] }[];
}) {
  return (
    <aside className="card-side">
      <Topics tags={item.tags} save={save} />
      <Details item={item} save={save} />
      <When item={item} />
      <Connections
        title="Links to"
        rows={linksTo.map((c) => ({ card: c, why: c.kind + (c.status === "done" ? " · done" : "") }))}
      />
      <Connections
        title="Connected through topics"
        rows={related.map(({ card, topics }) => ({
          card,
          why: topics
            .slice(0, 2)
            .map((t) => `#${t}`)
            .join(" "),
        }))}
      />
    </aside>
  );
}
