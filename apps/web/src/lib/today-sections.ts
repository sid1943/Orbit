import {
  byStatusThenRecent,
  closestToFinished,
  dailyPick,
  daysUntil,
  inSeasonOnly,
  timeInfo,
  type SyncItem,
  type TimeInfo,
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
}

/** Kinds "Pick one today" chooses from. */
const PICK_KINDS = new Set(["Movie", "Show", "Book", "Experience", "Place"]);

/**
 * Everything Center Base's Today, Coming up and In season sides show from the sync list, with the same rules as the
 * first Orbit (Coming up: every open card with a next date, soonest first; In season: every one good this month that has no exact day, so no card is in both).
 */
export function todaySections(all: readonly SyncItem[], now = new Date()): TodaySections {
  const live = all.filter((i) => !i.deleted && !i.archived);

  const dated: Dated[] = [];
  for (const item of live) {
    if (item.status === "done") continue;
    const when = timeInfo(item, now);
    if (when) dated.push({ item, when, days: when.next ? daysUntil(when.next, now) : null });
  }
  // Each lists all of its cards, and they never cross: a card with an exact day is Coming up; In season only has
  // cards that name a month or season without a day.
  const comingUp = dated.filter((d) => d.days !== null).sort((a, b) => a.days! - b.days!);
  const seasonal = dated.filter((d) => inSeasonOnly(d.when, now));

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
  };
}
