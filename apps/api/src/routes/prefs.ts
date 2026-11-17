import { PREF_KEYS } from "@orbit/core";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";

export const prefs = new Hono<AppEnv>();

prefs.get("/", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT key, value FROM prefs").all<{ key: string; value: string }>();
  return c.json(Object.fromEntries(results.map((r) => [r.key, JSON.parse(r.value)])));
});

prefs.put("/:key", async (c) => {
  const key = c.req.param("key");
  if (!(PREF_KEYS as readonly string[]).includes(key))
    return c.json({ error: `unknown setting; use one of ${PREF_KEYS.join(", ")}` }, 400);
  const value: unknown = await c.req.json().catch(() => undefined);
  if (value === undefined) return c.json({ error: "send JSON" }, 400);
  await c.env.DB.prepare(
    "INSERT INTO prefs (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
  )
    .bind(key, JSON.stringify(value), Date.now())
    .run();
  return c.json({ ok: true });
});
