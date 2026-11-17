import { mergeSync, type PrefKey, type Prefs, type ReviewDecision, type SyncItem, type SyncState } from "@orbit/core";
import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { ApiError, type ApiClient } from "./client.js";

export const ApiContext = createContext<ApiClient | null>(null);

/** The API client given to the app in `main.tsx`. */
export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error("useApi needs <ApiContext.Provider>");
  return api;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        // A wrong token or a missing API won't fix itself by retrying.
        retry: (count, err) => !(err instanceof ApiError && (err.status === 0 || err.status === 401)) && count < 2,
      },
    },
  });
}

export const keys = {
  health: ["health"] as const,
  sync: ["sync"] as const,
  item: (id: string) => ["item", id] as const,
  prefs: ["prefs"] as const,
};

export const useHealth = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.health, queryFn: api.health, staleTime: 5 * 60_000 });
};

/**
 * Every card in light form (deleted ones included, flagged `deleted`): the one list Today,
 * Everything, kind pages, topics, search and the map work from. The first load fetches all cards;
 * later refreshes fetch only what changed since the last one and merge it in.
 */
export function useSync<T = SyncState>(select?: (s: SyncState) => T) {
  const api = useApi();
  const qc = useQueryClient();
  return useQuery({
    queryKey: keys.sync,
    queryFn: async () => {
      const prev = qc.getQueryData<SyncState>(keys.sync);
      return mergeSync(prev, await api.syncAll(prev?.at ?? 0));
    },
    staleTime: 30_000,
    ...(select ? { select } : {}),
  });
}

const liveCards = (s: SyncState): SyncItem[] => s.items.filter((i) => !i.deleted);

/** Every card that isn't deleted, for counts, lists and search. */
export const useItemSummaries = () => useSync(liveCards);

/** One card with its linked things, TV status, covers and review answers, for the card panel. */
export const useFullItem = (id: string | undefined) => {
  const api = useApi();
  return useQuery({ queryKey: keys.item(id ?? ""), queryFn: () => api.getFullItem(id!), enabled: !!id });
};

/** Answer a link guess (`decision`), or undo the answer (`null`). Refreshes the card and the list. */
export function useReview() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, decision }: { key: string; decision: ReviewDecision | null }): Promise<void> => {
      if (decision) await api.putReview(key, decision);
      else await api.deleteReview(key);
    },
    onSuccess: () =>
      Promise.all([qc.invalidateQueries({ queryKey: ["item"] }), qc.invalidateQueries({ queryKey: keys.sync })]),
  });
}

export const usePrefs = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.prefs, queryFn: api.getPrefs });
};

/** Saves one setting silently (no "saved" message); the cached prefs update right away. */
export function useSetPref<K extends PrefKey>(key: K) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (value: Prefs[K]) => api.putPref(key, value),
    onMutate: (value) => {
      const prev = qc.getQueryData<Prefs>(keys.prefs);
      if (prev) qc.setQueryData<Prefs>(keys.prefs, { ...prev, [key]: value });
      return { prev };
    },
    onError: (_err, _value, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.prefs, ctx.prev);
    },
  });
}
