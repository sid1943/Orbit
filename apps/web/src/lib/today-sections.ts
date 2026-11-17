import {
  byStatusThenRecent,
  closestToFinished,
  dailyPick,
  daysUntil,
  inSeason,
  timeInfo,
  topicCounts,
  type SyncItem,
  type TimeInfo,
  type TopicCount,
} from "@orbit/core";

export interface Dated {
  item: SyncItem;
  when: TimeInfo;
  /** Days until it happens next, when it has a date. */
  days: number | null;
}

export interface TodoGroup {
  quest: string;
  items: SyncItem[];
}

export interface TodaySections {
  comingUp: Dated[];
  inSeason: Dated[];
  inProgress: SyncItem[];
  doingCount: number;
  todos: TodoGroup[];
  todoCount: number;
  closest: SyncItem[];
  picks: SyncItem[];
  recent: SyncItem[];
  topics: TopicCount[];
}

/** Kinds "Pick one today" chooses from. */
const PICK_KINDS = new Set(["Movie", "Show", "Book", "Experience", "Place"]);

/**
 * Everything the Today page shows from the sync list, with the same rules as the first Orbit.
 * Near you comes from the places list instead (`near-you.ts`).
 */
export function todaySections(all: readonly SyncItem[], now = new Date()): TodaySections {
  const live = all.filter((i) => !i.deleted && !i.archived);

  const dated: Dated[] = [];
  for (const item of live) {
    if (item.status === "done") continue;
    const when = timeInfo(item, now);
    if (when) dated.push({ item, when, days: when.next ? daysUntil(when.next, now) : null });
  }
  const comingAll = dated.filter((d) => d.days !== null && d.days <= 120).sort((a, b) => a.days! - b.days!);
  const comingUp = comingAll.slice(0, 8);
  const shown = new Set(comingUp.map((d) => d.item.id));
  const seasonal = dated.filter((d) => inSeason(d.when, now) && !shown.has(d.item.id)).slice(0, 10);

  const doing = live.filter((i) => i.status === "doing").sort(byStatusThenRecent);

  const openTodos = live.filter((i) => i.kind === "To-do" && i.status !== "done");
  const groups = new Map<string, SyncItem[]>();
  for (const t of openTodos) {
    const q = t.props.Quest?.trim() || "Other";
    groups.set(q, [...(groups.get(q) ?? []), t]);
  }
  const todos = [...groups]
    .map(([quest, items]) => ({
      quest,
      items: items.sort((a, b) => (a.due ?? "9").localeCompare(b.due ?? "9") || a.title.localeCompare(b.title)),
    }))
    .sort((a, b) => b.items.length - a.items.length || a.quest.localeCompare(b.quest));

  const picks = dailyPick(
    live
      .filter((i) => i.status === "todo" && PICK_KINDS.has(i.kind) && i.tags.length > 0)
      .sort((a, b) => a.id.localeCompare(b.id)),
    6,
    now,
  );

  return {
    comingUp,
    inSeason: seasonal,
    inProgress: doing.slice(0, 8),
    doingCount: doing.length,
    todos,
    todoCount: openTodos.length,
    closest: closestToFinished(live, 9),
    picks,
    recent: [...live].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8),
    topics: topicCounts(live)
      .filter((t) => t.count >= 8)
      .slice(0, 40),
  };
}
