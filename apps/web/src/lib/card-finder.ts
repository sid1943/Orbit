import { useCallback } from "react";
import { useSync } from "../api/queries.js";
import type { SyncState } from "@orbit/core";

const titleIndex = (s: SyncState): Map<string, string> => {
  const m = new Map<string, string>();
  for (const i of s.items) if (!i.deleted && !m.has(i.title.toLowerCase())) m.set(i.title.toLowerCase(), i.id);
  return m;
};

/** Finds a card's id by its exact title (any case), for [[Exact title]] links in notes. */
export function useCardFinder(): (title: string) => string | null {
  const { data } = useSync(titleIndex);
  return useCallback((title: string) => data?.get(title.trim().toLowerCase()) ?? null, [data]);
}
