import { kindHue } from "@orbit/core";
import type { CSSProperties } from "react";

/** Style that gives an element its kind's hue (`--kh`); CSS turns it into `--kc`. */
export const kindStyle = (kind: string) => ({ "--kh": kindHue(kind) }) as CSSProperties;

/** The kind's name with its colored dot, as rows and cards show it. */
export function KindChip({ kind }: { kind: string }) {
  return (
    <span className="chip kind-chip" style={kindStyle(kind)}>
      <i className="dot" aria-hidden="true" />
      {kind}
    </span>
  );
}
