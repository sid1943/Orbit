import { KINDS, STATUS_LABELS, STATUSES, byStatusThenRecent, type Status, type SyncItem } from "@orbit/core";

export type StatusFilter = Status | "all";
export type GroupBy = "none" | "kind" | "status";

export const STATUS_FILTERS: readonly { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  ...STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
];

export const GROUPS: readonly { value: GroupBy; label: string }[] = [
  { value: "none", label: "Flat" },
  { value: "kind", label: "By kind" },
  { value: "status", label: "By status" },
];

export const parseStatus = (v: string | null): StatusFilter =>
  (STATUSES as readonly string[]).includes(v ?? "") ? (v as Status) : "all";
export const parseGroup = (v: string | null): GroupBy => (v === "kind" || v === "status" ? v : "none");

/** The cards a list shows, in list order (doing, to do, done, dropped; newest change first). */
export function listItems(
  items: readonly SyncItem[],
  { kind, status, showArchived }: { kind?: string; status: StatusFilter; showArchived: boolean },
): SyncItem[] {
  return items
    .filter(
      (i) =>
        !i.deleted &&
        (showArchived || !i.archived) &&
        (!kind || i.kind === kind) &&
        (status === "all" || i.status === status),
    )
    .sort(byStatusThenRecent);
}

export interface ListGroup {
  /** Empty for a flat list. */
  label: string;
  kind?: string;
  items: SyncItem[];
}

/** Splits a list by kind (standard order) or status; empty groups are left out. */
export function groupItems(items: readonly SyncItem[], by: GroupBy): ListGroup[] {
  if (by === "none") return [{ label: "", items: [...items] }];
  if (by === "status")
    return STATUSES.map((s) => ({ label: STATUS_LABELS[s], items: items.filter((i) => i.status === s) })).filter(
      (g) => g.items.length,
    );
  const known = new Set<string>(KINDS);
  const kinds = [...KINDS, ...new Set(items.map((i) => i.kind).filter((k) => !known.has(k)))];
  return kinds
    .map((k) => ({ label: k, kind: k, items: items.filter((i) => i.kind === k) }))
    .filter((g) => g.items.length);
}
