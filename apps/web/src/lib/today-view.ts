/** Today's three sides: its own sections, every card with filters, or places near you. */
export type TodayView = "today" | "all" | "near";

export const TODAY_VIEWS: readonly { value: TodayView; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "all", label: "All cards" },
  { value: "near", label: "Near me" },
];

/** Which side the address asks for: `?all=1` is All cards, `?near=1` is Near me, otherwise Today. */
export function readTodayView(p: URLSearchParams): TodayView {
  if (p.get("near") === "1") return "near";
  if (p.get("all") === "1") return "all";
  return "today";
}

/** The address for a side, starting fresh (each side's own filters don't carry over). */
export function todayViewParams(view: TodayView): Record<string, string> {
  return view === "all" ? { all: "1" } : view === "near" ? { near: "1" } : {};
}

/** An old page address (`/all`, `/near`) as the matching side of Today, keeping its filters. */
export function todayViewPath(view: Exclude<TodayView, "today">, search: string): string {
  const p = new URLSearchParams(search);
  p.delete("all");
  p.delete("near");
  const out = new URLSearchParams(todayViewParams(view));
  for (const [k, v] of p) out.append(k, v);
  return `/?${out.toString()}`;
}
