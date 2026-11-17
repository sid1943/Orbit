import {
  kindList,
  kindNameProblem,
  mergePlaces,
  suggestHue,
  mergeSync,
  upsertSyncItem,
  type FullItem,
  type Item,
  type PlacesState,
  type PrefKey,
  type Prefs,
  type ReviewDecision,
  type SyncItem,
  type SyncState,
} from "@orbit/core";
import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { ApiError, type ApiClient, type ItemEditFields, type KindEntry, type NewItemFields } from "./client.js";

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
  connections: (id: string) => ["connections", id] as const,
  places: ["places"] as const,
  kinds: ["kinds"] as const,
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

/**
 * Every card and checklist row linked to a place, for Near you and Near me. Sort them with
 * `placesByDistance()` from core and join `itemId` to `useSync()` for the card. Refreshes fetch only
 * the places of cards that changed.
 */
export function usePlaces() {
  const api = useApi();
  const qc = useQueryClient();
  return useQuery({
    queryKey: keys.places,
    queryFn: async () => {
      const prev = qc.getQueryData<PlacesState>(keys.places);
      return mergePlaces(prev, await api.getPlaces(prev?.at ?? 0));
    },
    staleTime: 30_000,
  });
}

/**
 * Every kind in order (the 13 standard ones, then Sid's own), each with name, hue, `order`, `standard`
 * and card count. Until it loads, the standard list stands in, so tiles and colours never wait.
 * Pass the list to `countByKind()`, `kindFromSlug()` and `kindHue()` from core so custom kinds work.
 */
export function useKinds() {
  const api = useApi();
  return useQuery({
    queryKey: keys.kinds,
    queryFn: api.listKinds,
    placeholderData: (): KindEntry[] => kindList().map((k) => ({ ...k, count: 0 })),
    staleTime: 5 * 60_000,
  });
}

/**
 * Add a kind (`{ name, hue? }`). The cached list shows it at once and goes back if the API refuses it.
 * A name that's empty or already taken (in any capitalization) is refused before anything is sent:
 * the error's message says why.
 */
export function useAddKind() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (kind: { name: string; hue?: number }) => api.addKind(kind),
    // Runs before mutationFn: check the name against the list as it is, then show the new kind at once.
    // (Checking after adding it would always find the name taken.) A bad name throws here, so nothing is sent.
    onMutate: (kind) => {
      const prev = qc.getQueryData<KindEntry[]>(keys.kinds);
      const current = prev ?? kindList().map((k) => ({ ...k, count: 0 }));
      const problem = kindNameProblem(kind.name, current);
      if (problem) throw new ApiError(400, problem);
      qc.setQueryData<KindEntry[]>(keys.kinds, [
        ...current,
        {
          name: kind.name.trim(),
          hue: kind.hue ?? suggestHue(current),
          order: current.length,
          standard: false,
          count: 0,
        },
      ]);
      return { prev };
    },
    onError: (_err, _kind, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.kinds, ctx.prev);
      else void qc.invalidateQueries({ queryKey: keys.kinds });
    },
    onSuccess: (res) => qc.setQueryData(keys.kinds, res.kinds),
  });
}

/** One card with its linked things, TV status, covers and review answers, for the card panel. */
export const useFullItem = (id: string | undefined) => {
  const api = useApi();
  return useQuery({ queryKey: keys.item(id ?? ""), queryFn: () => api.getFullItem(id!), enabled: !!id });
};

/**
 * A card's connections: its series in order (with where this card sits and what's next), what it
 * follows and what follows it, what it's based on, what was made from it, its franchise. Each
 * connected thing lists Sid's cards for it in `inOrbit`; the rest are for "tap to add".
 */
export const useConnections = (id: string | undefined) => {
  const api = useApi();
  return useQuery({
    queryKey: keys.connections(id ?? ""),
    queryFn: () => api.getConnections(id!),
    enabled: !!id,
    staleTime: 10 * 60_000,
  });
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
      Promise.all([
        qc.invalidateQueries({ queryKey: ["item"] }),
        qc.invalidateQueries({ queryKey: keys.sync }),
        qc.invalidateQueries({ queryKey: keys.places }),
      ]),
  });
}

/** Puts a saved card into the cached list right away (no refetch of everything). */
function useUpsertCard() {
  const qc = useQueryClient();
  return (item: Item) => {
    qc.setQueryData<SyncState>(keys.sync, (s) => (s ? upsertSyncItem(s, item) : s));
    void qc.invalidateQueries({ queryKey: keys.item(item.id) });
    // Ticked or renamed rows change Near you; the refresh only fetches this card's places.
    void qc.invalidateQueries({ queryKey: keys.places });
  };
}

/** Add a card (the to-do box on Today, later the New item dialog). Silent on success. */
export function useCreateItem() {
  const api = useApi();
  const upsert = useUpsertCard();
  return useMutation({ mutationFn: (fields: NewItemFields) => api.createItem(fields), onSuccess: upsert });
}

/**
 * Change a card's fields (tick a to-do, change status). The list shows the change at once and
 * goes back if saving fails.
 */
export function useUpdateItem() {
  const api = useApi();
  const qc = useQueryClient();
  const upsert = useUpsertCard();
  return useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: Partial<NewItemFields> }) => api.updateItem(id, fields),
    onMutate: ({ id, fields }) => {
      const prev = qc.getQueryData<SyncState>(keys.sync);
      if (prev)
        qc.setQueryData<SyncState>(keys.sync, {
          ...prev,
          items: prev.items.map((i) => (i.id === id ? { ...i, ...fields, updatedAt: Date.now() } : i)),
        });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.sync, ctx.prev);
    },
    onSuccess: upsert,
  });
}

/**
 * Save changes from the card panel. The card and the lists show the change at once and go back if
 * saving fails. Each save sends whole fields (a whole checklist list), worked out from the card as
 * it shows now, so quick edits in a row build on each other.
 */
export function useEditCard(id: string) {
  const api = useApi();
  const qc = useQueryClient();
  const mutationKey = ["edit", id];
  return useMutation({
    mutationKey,
    mutationFn: (fields: ItemEditFields) => api.updateItem(id, fields),
    onMutate: async (fields) => {
      await qc.cancelQueries({ queryKey: keys.item(id) });
      const prevFull = qc.getQueryData<FullItem>(keys.item(id));
      const prevSync = qc.getQueryData<SyncState>(keys.sync);
      if (prevFull) {
        const item: Item = { ...prevFull.item, ...fields, updatedAt: Date.now() };
        qc.setQueryData<FullItem>(keys.item(id), { ...prevFull, item });
        if (prevSync) qc.setQueryData<SyncState>(keys.sync, upsertSyncItem(prevSync, item));
      }
      return { prevFull, prevSync };
    },
    onError: (_err, _fields, ctx) => {
      if (ctx?.prevFull) qc.setQueryData(keys.item(id), ctx.prevFull);
      if (ctx?.prevSync) qc.setQueryData(keys.sync, ctx.prevSync);
    },
    onSuccess: (item) => {
      qc.setQueryData<SyncState>(keys.sync, (s) => (s ? upsertSyncItem(s, item) : s));
      // Take the saved card, unless another edit is already on its way (it holds this one too).
      if (qc.isMutating({ mutationKey }) <= 1)
        qc.setQueryData<FullItem>(keys.item(id), (f) => (f ? { ...f, item } : f));
      void qc.invalidateQueries({ queryKey: keys.places });
    },
  });
}

/** Move a card to deleted. It leaves the lists at once. */
export function useDeleteItem() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteItem(id),
    onSuccess: (_r, id) => {
      qc.setQueryData<SyncState>(keys.sync, (s) =>
        s ? { ...s, items: s.items.map((i) => (i.id === id ? { ...i, deleted: true, updatedAt: Date.now() } : i)) } : s,
      );
      qc.removeQueries({ queryKey: keys.item(id) });
      void qc.invalidateQueries({ queryKey: keys.places });
    },
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
