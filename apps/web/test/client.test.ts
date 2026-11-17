import { describe, expect, it } from "vitest";
import { ApiError, createApiClient } from "../src/api/client.js";

type Call = { url: string; init: RequestInit | undefined };

/** A fake fetch that answers from a list and records what was asked. */
function fakeFetch(answers: { status?: number; body: unknown }[]) {
  const calls: Call[] = [];
  const fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const a = answers.shift() ?? { body: null };
    return new Response(JSON.stringify(a.body), { status: a.status ?? 200 });
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

describe("createApiClient", () => {
  it("sends the token and builds the URL", async () => {
    const f = fakeFetch([{ body: { ok: true, app: "orbit", version: "0.1.0" } }]);
    const api = createApiClient({ baseUrl: "https://api.example/", token: "t0k", fetch: f.fetch });
    await expect(api.health()).resolves.toMatchObject({ ok: true });
    expect(f.calls[0]?.url).toBe("https://api.example/api/health");
    expect(new Headers(f.calls[0]?.init?.headers).get("Authorization")).toBe("Bearer t0k");
  });

  it("follows pages until next is null", async () => {
    const row = (id: string) => ({ id, kind: "Movie", title: id, status: "todo", archived: false, deleted: false });
    const f = fakeFetch([
      { body: { items: [row("a"), row("b")], next: 2000 } },
      { body: { items: [row("c")], next: null } },
    ]);
    const api = createApiClient({ baseUrl: "", token: "t", fetch: f.fetch });
    const all = await api.allItems({ kind: "Movie" });
    expect(all.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(f.calls.map((c) => c.url)).toEqual([
      "/api/items?kind=Movie&limit=2000&offset=0",
      "/api/items?kind=Movie&limit=2000&offset=2000",
    ]);
  });

  it("turns error answers into ApiError with the API's message", async () => {
    const f = fakeFetch([{ status: 401, body: { error: "unauthorized" } }]);
    const api = createApiClient({ baseUrl: "", token: "bad", fetch: f.fetch });
    await expect(api.health()).rejects.toEqual(new ApiError(401, "unauthorized"));
  });

  it("reports an unreachable API as status 0", async () => {
    const api = createApiClient({
      baseUrl: "",
      token: "t",
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
    });
    await expect(api.health()).rejects.toMatchObject({ status: 0 });
  });

  it("treats a gateway error without JSON as unreachable", async () => {
    const fetch = async () => new Response("", { status: 502 });
    const api = createApiClient({ baseUrl: "", token: "t", fetch });
    await expect(api.health()).rejects.toMatchObject({ status: 0 });
  });

  it("parses prefs and saves one as JSON", async () => {
    const f = fakeFetch([{ body: { profile: { name: "Alex" } } }, { body: { ok: true } }]);
    const api = createApiClient({ baseUrl: "", token: "t", fetch: f.fetch });
    expect(await api.getPrefs()).toEqual({ profile: { name: "Alex" }, location: null });
    await api.putPref("location", { label: "Springfield" });
    expect(f.calls[1]?.url).toBe("/api/prefs/location");
    expect(f.calls[1]?.init?.method).toBe("PUT");
    expect(f.calls[1]?.init?.body).toBe(JSON.stringify({ label: "Springfield" }));
  });
});
