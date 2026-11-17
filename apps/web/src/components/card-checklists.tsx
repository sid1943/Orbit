import {
  addChecklist,
  addRow,
  checklistMatches,
  checklistProgress,
  deleteChecklist,
  deleteRow,
  editRow,
  moveRow,
  moveRowTo,
  renameChecklist,
  toggleRow,
  type Checklist,
  type ChecklistRow,
  type Entity,
  type ShownLink,
} from "@orbit/core";
import { useState } from "react";
import { Link } from "react-router";
import { AddBox } from "./add-box.js";
import { ProgressBar } from "./progress-bar.js";
import { RichText } from "./rich-text.js";

/** Rows shown per checklist before "Show all". */
const FIRST = 40;
/** A search box appears when a card has more rows than this. */
const SEARCH_FROM = 8;

export interface ChecklistsProps {
  lists: readonly Checklist[];
  /** The linked thing behind a row, with Sid's answers applied. */
  thingOf: (row: ChecklistRow) => Entity | null;
  /** A row's links (standard ones, minus hidden). */
  linksOf: (thing: Entity) => ShownLink[];
  /** Title and kind of a card a row points at, if it exists. */
  cardOf: (id: string) => { kind: string } | null;
  save: (lists: Checklist[]) => void;
}

/** Edit, move up/down, move to another checklist, delete: the tools under a row. */
function RowTools({
  lists,
  ci,
  ri,
  save,
  close,
}: {
  lists: readonly Checklist[];
  ci: number;
  ri: number;
  save: (lists: Checklist[]) => void;
  close: () => void;
}) {
  const row = lists[ci]!.rows[ri]!;
  const [text, setText] = useState(row.text);
  const done = (next: Checklist[]) => {
    save(next);
    close();
  };
  return (
    <div className="row-tools">
      <input
        aria-label="Entry text"
        value={text}
        autoFocus
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") done(editRow(lists, ci, ri, text));
          if (e.key === "Escape") close();
        }}
      />
      <button type="button" className="btn small" onClick={() => done(editRow(lists, ci, ri, text))}>
        Save
      </button>
      <button
        type="button"
        className="btn small"
        aria-label="Move up"
        disabled={ri === 0}
        onClick={() => save(moveRow(lists, ci, ri, -1))}
      >
        ↑
      </button>
      <button
        type="button"
        className="btn small"
        aria-label="Move down"
        disabled={ri === lists[ci]!.rows.length - 1}
        onClick={() => save(moveRow(lists, ci, ri, 1))}
      >
        ↓
      </button>
      {lists.length > 1 && (
        <select
          className="btn small"
          aria-label="Move to another checklist"
          value=""
          onChange={(e) => e.target.value && done(moveRowTo(lists, ci, ri, Number(e.target.value)))}
        >
          <option value="">Move to…</option>
          {lists.map((c, i) =>
            i === ci ? null : (
              <option key={i} value={i}>
                {c.name}
              </option>
            ),
          )}
        </select>
      )}
      <button type="button" className="btn small del" onClick={() => done(deleteRow(lists, ci, ri))}>
        Delete
      </button>
    </div>
  );
}

/** Rename or delete a whole checklist (delete asks twice). */
function ListTools({
  lists,
  ci,
  save,
  close,
}: {
  lists: readonly Checklist[];
  ci: number;
  save: (lists: Checklist[]) => void;
  close: () => void;
}) {
  const c = lists[ci]!;
  const [name, setName] = useState(c.name);
  const [sure, setSure] = useState(false);
  return (
    <div className="row-tools list-tools">
      <input
        aria-label="Checklist name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            save(renameChecklist(lists, ci, name));
            close();
          }
        }}
      />
      <button
        type="button"
        className="btn small"
        onClick={() => {
          save(renameChecklist(lists, ci, name));
          close();
        }}
      >
        Rename
      </button>
      <button
        type="button"
        className="btn small del"
        onClick={() => {
          if (!sure) return setSure(true);
          save(deleteChecklist(lists, ci));
          close();
        }}
      >
        {sure ? `Click again to delete ${c.rows.length} items` : "Delete checklist"}
      </button>
    </div>
  );
}

/** One checklist row: tick box, text (with its linked thing's links), a link to the card it points at, and tools. */
function Row({
  row,
  open,
  onTick,
  onMenu,
  props,
}: {
  row: ChecklistRow;
  open: boolean;
  onTick: () => void;
  onMenu: () => void;
  props: ChecklistsProps;
}) {
  const thing = props.thingOf(row);
  const links = thing ? props.linksOf(thing) : [];
  const ref = row.ref ? props.cardOf(row.ref) : null;
  return (
    <div className={`cl-row${row.done ? " done" : ""}`}>
      <button
        type="button"
        className={`check${row.done ? " done" : ""}`}
        aria-label={row.done ? "Mark not done" : "Mark done"}
        onClick={onTick}
      />
      <span className="cl-text">
        <span className="cl-label">
          <RichText text={row.text} />
        </span>
        {links.length > 0 && (
          <span className="cl-links">
            {links.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">
                {l.label}
              </a>
            ))}
          </span>
        )}
      </span>
      {ref && row.ref && (
        <Link className="cl-go" to={`/item/${encodeURIComponent(row.ref)}`} title="Open the linked card">
          → {ref.kind}
        </Link>
      )}
      <button
        type="button"
        className={`cl-menu${open ? " on" : ""}`}
        aria-label="Edit, move or delete this entry"
        aria-expanded={open}
        title="Edit, move or delete"
        onClick={onMenu}
      >
        ⋯
      </button>
    </div>
  );
}

/** Every checklist on the card: search, progress, rows with tools, add rows, add checklists. */
export function CardChecklists(props: ChecklistsProps) {
  const { lists, save } = props;
  const [q, setQ] = useState("");
  const [rowMenu, setRowMenu] = useState<string | null>(null);
  const [listMenu, setListMenu] = useState<number | null>(null);
  const [showAll, setShowAll] = useState<ReadonlySet<number>>(new Set());
  const { done, total } = checklistProgress({ checklists: [...lists] });
  const hits = checklistMatches(lists, q, props.thingOf);
  const found = hits?.reduce((n, h) => n + h.length, 0) ?? 0;

  return (
    <section className="card-sec">
      <h3>
        Checklists
        {total > 0 && (
          <span className="muted small-text">
            {done}/{total} done
          </span>
        )}
      </h3>
      {total > SEARCH_FROM && (
        <div className="cl-search">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${total.toLocaleString()} items in this card`}
            aria-label="Search this card's checklists"
            autoComplete="off"
          />
          {hits && <span className="muted small-text">{found} found</span>}
        </div>
      )}
      {lists.map((c, ci) => {
        if (hits && !hits[ci]!.length) return null;
        const ticked = c.rows.filter((r) => r.done).length;
        const all = showAll.has(ci);
        const indexes = hits ? hits[ci]! : [...c.rows.keys()].slice(0, all ? undefined : FIRST);
        return (
          <div className="cl" key={ci}>
            <div className="cl-head">
              <span>{c.name}</span>
              <ProgressBar done={ticked} total={c.rows.length} wide />
              <span className="mono small-text">
                {ticked}/{c.rows.length}
              </span>
              <button
                type="button"
                className="cl-menu"
                aria-label="Checklist options"
                title="Rename or delete this checklist"
                onClick={() => setListMenu(listMenu === ci ? null : ci)}
              >
                ⋯
              </button>
            </div>
            {listMenu === ci && <ListTools lists={lists} ci={ci} save={save} close={() => setListMenu(null)} />}
            {indexes.map((ri) => {
              const key = `${ci}:${ri}`;
              return (
                <div key={key}>
                  <Row
                    row={c.rows[ri]!}
                    open={rowMenu === key}
                    onTick={() => save(toggleRow(lists, ci, ri))}
                    onMenu={() => setRowMenu(rowMenu === key ? null : key)}
                    props={props}
                  />
                  {rowMenu === key && (
                    <RowTools lists={lists} ci={ci} ri={ri} save={save} close={() => setRowMenu(null)} />
                  )}
                </div>
              );
            })}
            {!hits && c.rows.length > FIRST && (
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  const next = new Set(showAll);
                  if (all) next.delete(ci);
                  else next.add(ci);
                  setShowAll(next);
                }}
              >
                {all ? "Show fewer" : `Show all ${c.rows.length.toLocaleString()}`}
              </button>
            )}
            {!hits && <AddBox label={`Add to ${c.name}`} onAdd={(text) => save(addRow(lists, ci, text))} />}
          </div>
        );
      })}
      {!hits && <AddBox label="+ New checklist" onAdd={(name) => save(addChecklist(lists, name))} />}
    </section>
  );
}
