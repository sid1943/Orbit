import { trelloCardFinder, type CardForUrl, type SyncState } from "@orbit/core";
import { useCallback } from "react";
import { useSync } from "../api/queries.js";

const titleIndex = (s: SyncState): Map<string, string> => {
  const m = new Map<string, string>();
  for (const i of s.items) if (!i.deleted && !m.has(i.title.toLowerCase())) m.set(i.title.toLowerCase(), i.id);
  return m;
};

const trelloIndex = (s: SyncState): CardForUrl => trelloCardFinder(s.items);
const none: CardForUrl = () => null;

/** Finds a card's id by its exact title (any case), for [[Exact title]] links in notes. */
export function useCardFinder(): (title: string) => string | null {
  const { data } = useSync(titleIndex);
  return useCallback((title: string) => data?.get(title.trim().toLowerCase()) ?? null, [data]);
}

/** Finds the Orbit card an old Trello card link became (Trello is gone; its links are never shown). */
export function useTrelloCards(): CardForUrl {
  return useSync(trelloIndex).data ?? none;
}
