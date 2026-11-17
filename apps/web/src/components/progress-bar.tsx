/** Checklist progress as a thin bar. */
export function ProgressBar({ done, total, wide = false }: { done: number; total: number; wide?: boolean }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <span
      className={`bar${wide ? " wide" : ""}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${done} of ${total} done`}
    >
      <i style={{ width: `${pct}%` }} />
    </span>
  );
}
