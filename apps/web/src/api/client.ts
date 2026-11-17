import { type Item, type Prefs, type PrefKey, type Status, parsePrefs } from "@orbit/core";

/** The light card fields `GET /api/items` returns without `full=1`. */
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

export interface ItemQuery {
  kind?: string;
  status?: Status;
  since?: number;
  limit?: number;
  offset?: number;
}

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
    getPrefs: async (): Promise<Prefs> => parsePrefs(await request<unknown>("/prefs")),
    putPref: <K extends PrefKey>(key: K, value: Prefs[K]) =>
      request<{ ok: boolean }>(`/prefs/${key}`, { method: "PUT", body: JSON.stringify(value) }),
  };
}
