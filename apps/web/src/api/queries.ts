import { type PrefKey, type Prefs } from "@orbit/core";
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
  items: ["items", "summary"] as const,
  prefs: ["prefs"] as const,
};

export const useHealth = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.health, queryFn: api.health, staleTime: 5 * 60_000 });
};

/** Every card's light fields, for counts, lists and search. */
export const useItemSummaries = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.items, queryFn: () => api.allItems() });
};

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
