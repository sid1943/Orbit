import { KINDS, STATUSES, STATUS_LABELS, type Item, type Status } from "@orbit/core";
import { useState } from "react";
import type { ItemEditFields } from "../api/client.js";
import { KindChip } from "./kind-chip.js";
import { Segmented } from "./segmented.js";

const STATUS_OPTIONS = STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }));

/** The title box: grows with the text, saves when you leave it or press Enter. */
function TitleBox({ title, onSave }: { title: string; onSave: (t: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? title;
  const commit = () => {
    if (draft !== null && draft.trim() && draft.trim() !== title) onSave(draft.trim());
    setDraft(null);
  };
  return (
    <textarea
      className="card-title"
      aria-label="Title"
      rows={1}
      value={value}
      ref={(el) => {
        if (el) {
          el.style.height = "auto";
          el.style.height = `${el.scrollHeight}px`;
        }
      }}
      onChange={(e) => setDraft(e.target.value.replace(/\n/g, " "))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setDraft(null);
        }
      }}
    />
  );
}

/** Kind, title, status, Archive and Delete, and the close button. */
export function CardHeader({
  item,
  kinds,
  save,
  onDelete,
  onClose,
}: {
  item: Item;
  kinds: readonly string[];
  save: (fields: ItemEditFields) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const kindList = [...new Set([...KINDS, ...kinds, item.kind])];
  return (
    <header className="card-head">
      <div className="card-line1">
        <KindChip kind={item.kind} />
        <select
          className="btn small"
          aria-label="Kind"
          value={item.kind}
          onChange={(e) => save({ kind: e.target.value })}
        >
          {kindList.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
        {item.archived && <span className="chip">archived</span>}
        <span className="spacer" />
        <button type="button" className="btn small" onClick={() => save({ archived: !item.archived })}>
          {item.archived ? "Unarchive" : "Archive"}
        </button>
        <button
          type="button"
          className="btn small del"
          onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
          onBlur={() => setConfirmDelete(false)}
        >
          {confirmDelete ? "Click again to delete" : "Delete"}
        </button>
        <button type="button" className="card-close" onClick={onClose} aria-label="Close" title="Close">
          ×
        </button>
      </div>
      <TitleBox key={item.title} title={item.title} onSave={(title) => save({ title })} />
      <Segmented<Status>
        label="Status"
        value={item.status}
        options={STATUS_OPTIONS}
        onChange={(status) => save({ status })}
      />
    </header>
  );
}
