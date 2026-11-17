import type { ReactNode } from "react";

/** A titled block on Today: heading, a short note, and an optional link on the right. */
export function Section({
  title,
  note,
  action,
  children,
}: {
  title: string;
  note?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const id = `sec-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section className="sec" aria-labelledby={id}>
      <div className="sec-head">
        <h2 id={id}>{title}</h2>
        {note && <span className="note">{note}</span>}
        {action && <span className="action">{action}</span>}
      </div>
      {children}
    </section>
  );
}
