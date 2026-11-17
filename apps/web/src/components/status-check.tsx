import { STATUS_LABELS, nextStatus, type Status } from "@orbit/core";
import { useUpdateItem } from "../api/queries.js";

/** The box at the start of a row: shows the status and moves it on (to do → doing → done). */
export function StatusCheck({ id, status, todo = false }: { id: string; status: Status; todo?: boolean }) {
  const update = useUpdateItem();
  // To-dos tick straight to done and back; other cards step through doing.
  const next: Status = todo ? (status === "done" ? "todo" : "done") : nextStatus(status);
  return (
    <button
      type="button"
      className={`check ${status}`}
      aria-label={`${STATUS_LABELS[status]}. Change to ${STATUS_LABELS[next]}`}
      title={`${STATUS_LABELS[status]} (click for ${STATUS_LABELS[next]})`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        update.mutate({ id, fields: { status: next } });
      }}
    />
  );
}
