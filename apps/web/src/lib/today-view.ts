/**
 * Center Base's sides: Today's sections, every card with filters, places near you, the topic map, and Review
 * (link guesses waiting for an answer; on the switch only while there are some).
 */
export type TodayView = "today" | "all" | "near" | "map" | "review";

export const TODAY_VIEWS: readonly { value: TodayView; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "all", label: "All cards" },
  { value: "near", label: "Near me" },
  { value: "map", label: "Map" },
];

/** The switch's choices: Review joins (with its count) only while guesses are waiting, or while it is open. */
export function todayViews(pending: number, view: TodayView): { value: TodayView; label: string }[] {
  return pending > 0 || view === "review"
    ? [...TODAY_VIEWS, { value: "review", label: pending > 0 ? `Review · ${pending.toLocaleString()}` : "Review" }]
    : [...TODAY_VIEWS];
}

/** Which side the address asks for: `?all=1`, `?near=1`, `?map=1`, `?review=1`, otherwise Today. */
export function readTodayView(p: URLSearchParams): TodayView {
  if (p.get("review") === "1") return "review";
  if (p.get("map") === "1") return "map";
  if (p.get("near") === "1") return "near";
  if (p.get("all") === "1") return "all";
  return "today";
}

/** The address for a side, starting fresh (each side's own filters don't carry over). */
export function todayViewParams(view: TodayView): Record<string, string> {
  return view === "today" ? {} : { [view]: "1" };
}

/** An old page address (`/all`, `/near`, `/map`, `/review`) as the matching side of Center Base, keeping filters. */
export function todayViewPath(view: Exclude<TodayView, "today">, search: string): string {
  const p = new URLSearchParams(search);
  for (const k of ["all", "near", "map", "review"]) p.delete(k);
  const out = new URLSearchParams(todayViewParams(view));
  for (const [k, v] of p) out.append(k, v);
  return `/?${out.toString()}`;
}
