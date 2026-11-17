import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import type { Env } from "../src/env.js";
import { sameSecret } from "../src/middleware/auth.js";

// Requests that never reach the database, so no D1 is needed.
const env = { API_TOKEN: "test-token", DB: {} as D1Database } satisfies Env;

describe("API", () => {
  it("answers health without a token", async () => {
    const res = await app.request("/api/health", {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, app: "orbit" });
  });

  it("refuses requests without the right token", async () => {
    expect((await app.request("/api/items", {}, env)).status).toBe(401);
    const wrong = { headers: { Authorization: "Bearer nope" } };
    expect((await app.request("/api/items", wrong, env)).status).toBe(401);
  });

  it("refuses everything when no token is configured", async () => {
    const res = await app.request("/api/items", { headers: { Authorization: "Bearer " } }, { ...env, API_TOKEN: "" });
    expect(res.status).toBe(401);
  });

  it("answers unknown routes with JSON", async () => {
    const res = await app.request("/api/nope", { headers: { Authorization: "Bearer test-token" } }, env);
    expect(res.status).toBe(404);
  });
});

describe("sameSecret", () => {
  it("compares exactly", async () => {
    expect(await sameSecret("abc", "abc")).toBe(true);
    expect(await sameSecret("abc", "abd")).toBe(false);
    expect(await sameSecret("", "abc")).toBe(false);
  });
});
