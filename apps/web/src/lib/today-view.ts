/** Center Base's four sides: Today's sections, every card with filters, places near you, or the topic map. */
export type TodayView = "today" | "all" | "near" | "map";

export const TODAY_VIEWS: readonly { value: TodayView; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "all", label: "All cards" },
  { value: "near", label: "Near me" },
  { value: "map", label: "Map" },
];

/** Which side the address asks for: `?all=1` All cards, `?near=1` Near me, `?map=1` Map, otherwise Today. */
export function readTodayView(p: URLSearchParams): TodayView {
  if (p.get("map") === "1") return "map";
  if (p.get("near") === "1") return "near";
  if (p.get("all") === "1") return "all";
  return "today";
}

/** The address for a side, starting fresh (each side's own filters don't carry over). */
export function todayViewParams(view: TodayView): Record<string, string> {
  return view === "today" ? {} : { [view]: "1" };
}

/** An old page address (`/all`, `/near`, `/map`) as the matching side of Center Base, keeping its filters. */
export function todayViewPath(view: Exclude<TodayView, "today">, search: string): string {
  const p = new URLSearchParams(search);
  for (const k of ["all", "near", "map"]) p.delete(k);
  const out = new URLSearchParams(todayViewParams(view));
  for (const [k, v] of p) out.append(k, v);
  return `/?${out.toString()}`;
}
