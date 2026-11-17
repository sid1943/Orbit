import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS } from "@orbit/core";
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

  it("adds and changes cards with POST and PATCH", async () => {
    const f = fakeFetch([{ status: 201, body: { id: "n1" } }, { body: { id: "n1" } }]);
    const api = createApiClient({ baseUrl: "", token: "t", fetch: f.fetch });
    await api.createItem({ kind: "To-do", title: "Buy stamps", props: { Quest: "Errands" } });
    await api.updateItem("n1", { status: "done" });
    expect(f.calls.map((c) => [c.init?.method, c.url])).toEqual([
      ["POST", "/api/items"],
      ["PATCH", "/api/items/n1"],
    ]);
    expect(JSON.parse(String(f.calls[1]?.init?.body))).toEqual({ status: "done" });
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
    expect(await api.getPrefs()).toEqual({ ...DEFAULT_PREFS, profile: { name: "Alex" } });
    await api.putPref("location", { label: "Springfield" });
    expect(f.calls[1]?.url).toBe("/api/prefs/location");
    expect(f.calls[1]?.init?.method).toBe("PUT");
    expect(f.calls[1]?.init?.body).toBe(JSON.stringify({ label: "Springfield" }));
  });

  it("pages through all full cards (deleted too) and all linked things", async () => {
    const f = fakeFetch([
      { body: { items: [{ id: "a" }], next: 2000 } },
      { body: { items: [{ id: "b" }], next: null } },
      { body: { entities: [{ id: "e1" }], next: null } },
      { body: { reviews: [{ entityId: "e1", decision: { d: "yes" }, at: 1 }] } },
    ]);
    const api = createApiClient({ baseUrl: "", token: "t", fetch: f.fetch });
    expect((await api.allFullItems()).map((i) => i.id)).toEqual(["a", "b"]);
    expect((await api.allEntities()).map((e) => e.id)).toEqual(["e1"]);
    expect(await api.listReviews()).toHaveLength(1);
    expect(f.calls.map((c) => c.url)).toEqual([
      "/api/items?full=1&deleted=1&limit=2000&offset=0",
      "/api/items?full=1&deleted=1&limit=2000&offset=2000",
      "/api/entities?limit=2000&offset=0",
      "/api/reviews",
    ]);
  });

  it("stops paging linked things when an older API sends no next", async () => {
    const f = fakeFetch([{ body: { entities: [{ id: "e1" }] } }]);
    const api = createApiClient({ baseUrl: "", token: "t", fetch: f.fetch });
    expect(await api.allEntities()).toHaveLength(1);
  });

  it("follows sync pages and keeps the first page's time and removals", async () => {
    const f = fakeFetch([
      { body: { items: [{ id: "a" }, { id: "b" }], removed: ["z"], at: 50, next: "b" } },
      { body: { items: [{ id: "c" }], removed: [], at: 60, next: null } },
    ]);
    const api = createApiClient({ baseUrl: "", token: "t", fetch: f.fetch });
    const r = await api.syncAll(10);
    expect(r.items.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(r).toMatchObject({ removed: ["z"], at: 50 });
    expect(f.calls.map((c) => c.url)).toEqual(["/api/sync?since=10", "/api/sync?since=10&after=b"]);
  });

  it("asks for a full card and sends review answers", async () => {
    const f = fakeFetch([{ body: { item: { id: "x y" } } }, { body: {} }, { body: { ok: true } }]);
    const api = createApiClient({ baseUrl: "", token: "t", fetch: f.fetch });
    await api.getFullItem("x y");
    await api.putReview("x:e1", { d: "hide", urls: ["https://a.example"] });
    await api.deleteReview("e1");
    expect(f.calls.map((c) => [c.init?.method ?? "GET", c.url])).toEqual([
      ["GET", "/api/items/x%20y/full"],
      ["PUT", "/api/reviews/x%3Ae1"],
      ["DELETE", "/api/reviews/e1"],
    ]);
  });

  it("asks for places, all of them or only what changed", async () => {
    const f = fakeFetch([{ body: { places: [], items: null, at: 5 } }, { body: { places: [], items: [], at: 9 } }]);
    const api = createApiClient({ baseUrl: "", token: "t", fetch: f.fetch });
    await api.getPlaces();
    await api.getPlaces(5);
    expect(f.calls.map((c) => c.url)).toEqual(["/api/places", "/api/places?since=5"]);
  });
});
