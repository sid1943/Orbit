import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import { runScheduledJobs } from "../jobs/index.js";

export const enrich = new Hono<AppEnv>();

/** Run the 10-minute jobs now. */
enrich.post("/run", async (c) => c.json(await runScheduledJobs(c.env)));
