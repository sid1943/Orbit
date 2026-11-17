import { Hono } from "hono";
import type { ReviewDecision } from "@orbit/core";
import { UPSERT_REVIEW } from "../db/statements.js";
import type { AppEnv } from "../env.js";
import { isReviewDecision } from "../lib/validation.js";

export const reviews = new Hono<AppEnv>();

reviews.get("/", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT entity_id, decision, at FROM reviews").all<{
    entity_id: string;
    decision: string;
    at: number;
  }>();
  return c.json({
    reviews: results.map((r) => ({ entityId: r.entity_id, decision: JSON.parse(r.decision), at: r.at })),
  });
});

reviews.put("/:entityId", async (c) => {
  const decision = await c.req.json<ReviewDecision>().catch(() => null);
  if (!isReviewDecision(decision)) return c.json({ error: "decision must have d: yes|no|none|alt|fix|hide" }, 400);
  const review = { entityId: c.req.param("entityId"), decision, at: Date.now() };
  await c.env.DB.prepare(UPSERT_REVIEW).bind(review.entityId, JSON.stringify(decision), review.at).run();
  return c.json(review);
});
