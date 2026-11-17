import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import { idList } from "../lib/validation.js";

export const live = new Hono<AppEnv>();

/** TV status and covers for several linked things at once (`?ids=a,b`). */
live.get("/", async (c) => {
  const ids = idList(c.req.query("ids"));
  if (!ids.length) return c.json({ live: [], covers: {} });
  const marks = ids.map(() => "?").join(",");
  const db = c.env.DB;
  const [status, covers] = await db.batch<{ entity_id: string; data?: string; url?: string }>([
    db.prepare(`SELECT entity_id, data FROM live WHERE entity_id IN (${marks})`).bind(...ids),
    db.prepare(`SELECT entity_id, url FROM covers WHERE entity_id IN (${marks})`).bind(...ids),
  ]);
  return c.json({
    live: (status?.results ?? []).map((r) => JSON.parse(r.data!)),
    covers: Object.fromEntries((covers?.results ?? []).map((r) => [r.entity_id, r.url])),
  });
});
