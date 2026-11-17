import type { ReactNode } from "react";

/** One setting: its name (and an optional explanation) on the left, the control on the right. `wide` stacks them. */
export function SettingRow({
  title,
  hint,
  wide = false,
  htmlFor,
  children,
}: {
  title: string;
  hint?: ReactNode;
  wide?: boolean;
  htmlFor?: string;
  children: ReactNode;
}) {
  const head = (
    <>
      <b>{title}</b>
      {hint && <small>{hint}</small>}
    </>
  );
  return (
    <div className={`srow${wide ? " wide" : ""}`}>
      {htmlFor ? (
        <label className="srow-name" htmlFor={htmlFor}>
          {head}
        </label>
      ) : (
        <div className="srow-name">{head}</div>
      )}
      <div className="srow-control">{children}</div>
    </div>
  );
}
