import {
  type Entity,
  type FullItem,
  type Item,
  type KindInfo,
  type PlacesPage,
  type Prefs,
  type PrefKey,
  type Review,
  type ReviewDecision,
  type Status,
  type SyncPage,
  parsePrefs,
} from "@orbit/core";

/** The light card fields `GET /api/items` returns without `full=1`. A `SyncItem` has all of them. */
export interface ItemSummary {
  id: string;
  kind: string;
  title: string;
  status: Status;
  archived: boolean;
  deleted: boolean;
  entityId: string | null;
  due: string | null;
  updatedAt: number;
}

/** Fields a new card (or an edit) can set. */
export type NewItemFields = Partial<
  Pick<Item, "kind" | "title" | "status" | "tags" | "props" | "notes" | "due" | "start" | "archived">
> &
  Pick<Item, "kind" | "title">;

/** Fields the card panel can change on a card (everything the API lets a client set). */
export type ItemEditFields = Partial<
  Pick<
    Item,
    | "kind"
    | "title"
    | "status"
    | "tags"
    | "props"
    | "notes"
    | "due"
    | "start"
    | "archived"
    | "deleted"
    | "refs"
    | "links"
    | "attachments"
    | "comments"
    | "checklists"
  >
>;

export interface ItemQuery {
  kind?: string;
  status?: Status;
  since?: number;
  limit?: number;
  offset?: number;
}

/** A kind as `GET /api/kinds` gives it: name, hue, place in the order, and how many cards it has. */
export type KindEntry = KindInfo & { count: number };

export interface ApiConfig {
  /** Origin of the API, or "" to call `/api` on the page's own origin (the dev proxy). */
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
}

/** A failed API call. `status` is 0 when the API could not be reached at all. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** Typed calls to the Orbit API. Every call sends the bearer token. */
export function createApiClient(config: ApiConfig) {
  const base = config.baseUrl.replace(/\/+$/, "");
  const doFetch = config.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${config.token}`);
    if (init.body !== undefined) headers.set("Content-Type", "application/json");
    let res: Response;
    try {
      res = await doFetch(`${base}/api${path}`, { ...init, headers });
    } catch {
      throw new ApiError(0, "The Orbit API can't be reached.");
    }
    const body: unknown = await res.json().catch(() => null);
    // A gateway error with no JSON is the dev proxy (or a host) saying the Worker isn't there.
    if (body === null && [502, 503, 504].includes(res.status)) throw new ApiError(0, "The Orbit API can't be reached.");
    if (!res.ok) {
      const msg =
        typeof body === "object" && body !== null && "error" in body ? String(body.error) : `HTTP ${res.status}`;
      throw new ApiError(res.status, msg);
    }
    return body as T;
  }

  const listItems = (q: ItemQuery = {}) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "") params.set(k, String(v));
    const qs = params.toString();
    return request<{ items: ItemSummary[]; next: number | null }>(`/items${qs ? `?${qs}` : ""}`);
  };

  const syncPage = (q: { since?: number; after?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (q.since) params.set("since", String(q.since));
    if (q.after) params.set("after", q.after);
    if (q.limit) params.set("limit", String(q.limit));
    const qs = params.toString();
    return request<SyncPage>(`/sync${qs ? `?${qs}` : ""}`);
  };

  return {
    health: () => request<{ ok: boolean; app: string; version: string }>("/health"),
    listItems,
    /** Every card's light fields, following the API's pages. */
    async allItems(q: Omit<ItemQuery, "limit" | "offset"> = {}): Promise<ItemSummary[]> {
      const out: ItemSummary[] = [];
      let offset: number | null = 0;
      while (offset !== null) {
        const page = await listItems({ ...q, limit: 2000, offset });
        out.push(...page.items);
        offset = page.next;
      }
      return out;
    },
    getItem: (id: string) => request<Item>(`/items/${encodeURIComponent(id)}`),
    /** Add a card; the API fills in the rest. */
    createItem: (fields: NewItemFields) => request<Item>("/items", { method: "POST", body: JSON.stringify(fields) }),
    /** Change some of a card's fields. */
    updateItem: (id: string, fields: ItemEditFields) =>
      request<Item>(`/items/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(fields),
      }),
    /** Move a card to deleted (it stays in the backup and can be brought back). */
    deleteItem: (id: string) => request<{ ok: boolean }>(`/items/${encodeURIComponent(id)}`, { method: "DELETE" }),
    /** One card with its linked things, TV status, covers and review answers (the card panel). */
    getFullItem: (id: string) => request<FullItem>(`/items/${encodeURIComponent(id)}/full`),
    /** Every card and checklist row linked to a place; with `since`, only the places of cards that changed. */
    getPlaces: (since = 0) => request<PlacesPage>(`/places${since ? `?since=${since}` : ""}`),
    syncPage,
    /** Every card changed since `since` (0 for all), following the pages. `at` is the next `since`. */
    async syncAll(since = 0): Promise<Pick<SyncPage, "items" | "removed" | "at">> {
      const first = await syncPage({ since });
      const items = [...first.items];
      let after = first.next;
      while (after) {
        const page = await syncPage({ since, after });
        items.push(...page.items);
        after = page.next;
      }
      return { items, removed: first.removed, at: first.at };
    },
    /** Every card, complete, deleted ones included: for the backup. */
    async allFullItems(): Promise<Item[]> {
      const out: Item[] = [];
      let offset: number | null = 0;
      while (offset !== null) {
        const page: { items: Item[]; next: number | null } = await request(
          `/items?full=1&deleted=1&limit=2000&offset=${offset}`,
        );
        out.push(...page.items);
        offset = page.next;
      }
      return out;
    },
    /** Every linked thing, following the API's pages. */
    async allEntities(): Promise<Entity[]> {
      const out: Entity[] = [];
      let offset: number | null = 0;
      while (offset !== null) {
        const page: { entities: Entity[]; next?: number | null } = await request(
          `/entities?limit=2000&offset=${offset}`,
        );
        out.push(...page.entities);
        offset = page.next ?? null;
      }
      return out;
    },
    listReviews: async (): Promise<Review[]> => (await request<{ reviews: Review[] }>("/reviews")).reviews,
    /** Every kind in order: the standard ones, then Sid's own, each with its card count. */
    listKinds: async (): Promise<KindEntry[]> => (await request<{ kinds: KindEntry[] }>("/kinds")).kinds,
    /** Add a kind after the others (no hue: one far from the others is picked). Refused if the name is taken. */
    addKind: (kind: { name: string; hue?: number }) =>
      request<{ kind: KindEntry; kinds: KindEntry[] }>("/kinds", { method: "POST", body: JSON.stringify(kind) }),
    /** Rename and/or recolour a custom kind; a rename moves its cards (`moved`). */
    updateKind: (name: string, change: { name?: string; hue?: number }) =>
      request<{ kinds: KindEntry[]; moved: number }>(`/kinds/${encodeURIComponent(name)}`, {
        method: "PATCH",
        body: JSON.stringify(change),
      }),
    /** Put the custom kinds in this order (each once). */
    reorderKinds: (names: string[]) =>
      request<{ kinds: KindEntry[] }>("/kinds/order", { method: "PUT", body: JSON.stringify({ names }) }),
    /** Delete a custom kind with no cards. Fails with status 409 when it has some. */
    deleteKind: (name: string) =>
      request<{ kinds: KindEntry[] }>(`/kinds/${encodeURIComponent(name)}`, { method: "DELETE" }),
    /** Answer a link guess (or hide links: key `x:<id>`). */
    putReview: (key: string, decision: ReviewDecision) =>
      request<Review>(`/reviews/${encodeURIComponent(key)}`, { method: "PUT", body: JSON.stringify(decision) }),
    /** Undo an answer. */
    deleteReview: (key: string) =>
      request<{ ok: boolean }>(`/reviews/${encodeURIComponent(key)}`, { method: "DELETE" }),
    getPrefs: async (): Promise<Prefs> => parsePrefs(await request<unknown>("/prefs")),
    putPref: <K extends PrefKey>(key: K, value: Prefs[K]) =>
      request<{ ok: boolean }>(`/prefs/${key}`, { method: "PUT", body: JSON.stringify(value) }),
  };
}
