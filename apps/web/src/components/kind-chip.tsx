import { kindHue, type KindInfo } from "@orbit/core";
import type { CSSProperties } from "react";
import { useKinds } from "../api/queries.js";

/** Style that gives an element its kind's hue (`--kh`); CSS turns it into `--kc`. Pass the kind list for custom kinds. */
export const kindStyle = (kind: string, kinds?: readonly KindInfo[]) =>
  ({ "--kh": kindHue(kind, kinds) }) as CSSProperties;

/** The kind's name with its colored dot, as rows and cards show it. */
export function KindChip({ kind }: { kind: string }) {
  const kinds = useKinds().data;
  return (
    <span className="chip kind-chip" style={kindStyle(kind, kinds)}>
      <i className="dot" aria-hidden="true" />
      {kind}
    </span>
  );
}
