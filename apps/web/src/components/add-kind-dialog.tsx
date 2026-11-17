import { kindList, kindNameProblem, suggestHue } from "@orbit/core";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useAddKind, useKinds } from "../api/queries.js";

/** Asks for a new kind's name and colour, then adds it. Closes on Add, Cancel or Escape. */
export function AddKindDialog({ onClose }: { onClose: () => void }) {
  const kinds = useKinds().data ?? kindList();
  const add = useAddKind();
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [hue, setHue] = useState(() => suggestHue(kinds));
  const [tried, setTried] = useState(false);
  // While saving, the list already holds the new kind, so don't check the name against it then.
  const problem = add.isPending || add.isSuccess ? null : kindNameProblem(name, kinds);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const save = () => {
    setTried(true);
    if (problem) return;
    add.mutate({ name: name.trim(), hue }, { onSuccess: onClose });
  };

  // Say what's wrong once there is something typed, or after Add was pressed.
  const message = (tried || name.trim()) && problem ? problem : add.error ? add.error.message : "";

  return (
    <dialog ref={dialog} className="dialog" aria-labelledby="add-kind-title" onClose={onClose}>
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <h2 id="add-kind-title">New kind</h2>
        <label className="field">
          <span>Name</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Board game"
            autoFocus
            maxLength={40}
            aria-invalid={!!message}
            aria-describedby="add-kind-msg"
          />
        </label>
        <label className="field">
          <span>Colour</span>
          <span className="hue-row">
            <i className="swatch" style={{ "--kh": hue } as CSSProperties} aria-hidden="true" />
            <input
              type="range"
              min={0}
              max={359}
              value={hue}
              onChange={(e) => setHue(Number(e.target.value))}
              className="hue-slider"
              aria-label="Colour"
            />
          </span>
        </label>
        <p id="add-kind-msg" className="error" role="alert">
          {message ? message.charAt(0).toUpperCase() + message.slice(1) + "." : ""}
        </p>
        <div className="dialog-buttons">
          <button type="button" className="btn" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={add.isPending}>
            Add
          </button>
        </div>
      </form>
    </dialog>
  );
}
