import type { ReactNode } from "react";

/** The page's own title and controls, in the strip under the search bar. Home has none. */
export function PageBar({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-bar">
      <div>
        <h2>{title}</h2>
        {sub && <div className="sub">{sub}</div>}
      </div>
      <span className="spacer" />
      {children}
    </div>
  );
}
