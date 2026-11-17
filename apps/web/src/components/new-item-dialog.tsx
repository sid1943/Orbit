import { KINDS, STATUSES, STATUS_LABELS, splitTopics, type Status } from "@orbit/core";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useCreateItem, useItemSummaries, useKinds } from "../api/queries.js";
import { Segmented } from "./segmented.js";

const STATUS_OPTIONS = STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }));

/** New item: a title (with #topics), a kind and a status. Enter adds it and opens the new card. */
export function NewItemDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<string>("To-do");
  const [status, setStatus] = useState<Status>("todo");
  const create = useCreateItem();
  const cards = useItemSummaries();
  const navigate = useNavigate();
  const custom = useKinds().data ?? [];
  const kinds = [...new Set([...KINDS, ...custom.map((k) => k.name), ...(cards.data ?? []).map((c) => c.kind)])];
  const { title, tags } = splitTopics(text);

  const add = () => {
    if (!title) return;
    create.mutate(
      { title, kind, status, tags },
      {
        onSuccess: (item) => {
          onClose();
          void navigate(`/item/${encodeURIComponent(item.id)}`);
        },
      },
    );
  };

  return (
    <div className="dialog-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="new-item-h">
        <h2 id="new-item-h">New item</h2>
        <input
          className="input"
          autoFocus
          placeholder="Title, with #topics"
          aria-label="Title, with #topics"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
            if (e.key === "Escape") onClose();
          }}
        />
        {tags.length > 0 && (
          <div className="cloud">
            {tags.map((t) => (
              <span className="chip" key={t}>
                #{t}
              </span>
            ))}
          </div>
        )}
        <label className="dialog-row">
          <span className="muted">Kind</span>
          <select className="btn" value={kind} onChange={(e) => setKind(e.target.value)}>
            {kinds.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <Segmented<Status> label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
        {create.isError && (
          <div className="error" role="alert">
            Couldn't add it: {create.error.message}
          </div>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={!title || create.isPending} onClick={add}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
