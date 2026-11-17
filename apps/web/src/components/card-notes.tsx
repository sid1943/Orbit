import { useState } from "react";
import { RichText } from "./rich-text.js";

const LONG = 900;

/** Notes with readable links; Edit turns them into a text box, Done saves. Long notes fold. */
export function CardNotes({ notes, onSave }: { notes: string; onSave: (notes: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const editing = draft !== null;
  const done = () => {
    if (draft !== null && draft !== notes) onSave(draft);
    setDraft(null);
  };
  return (
    <section className="card-sec">
      <h3>
        Notes
        <button type="button" className="btn small" onClick={() => (editing ? done() : setDraft(notes))}>
          {editing ? "Done" : "Edit"}
        </button>
      </h3>
      {editing ? (
        <>
          <textarea
            className="notes-edit"
            aria-label="Notes"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="muted small-text">Link to any card with [[Exact title]].</div>
        </>
      ) : notes ? (
        <>
          <div className={`notes${notes.length > LONG && !all ? " clamp" : ""}`}>
            <RichText text={notes} />
          </div>
          {notes.length > LONG && (
            <button type="button" className="btn small" onClick={() => setAll(!all)}>
              {all ? "Show less" : "Show all"}
            </button>
          )}
        </>
      ) : (
        <div className="muted">No notes yet.</div>
      )}
    </section>
  );
}
