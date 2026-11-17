import { Hono } from "hono";
import { UPSERT_REVIEW } from "../db/statements.js";
import type { AppEnv } from "../env.js";
import { parseReviewDecision } from "../lib/validation.js";

/**
 * Sid's answers to link guesses. They are kept apart from the guesses, so an answer can be undone;
 * every route that returns a linked thing applies the answer (`applyReview` in core).
 * Keys: an entity id, `card-<itemId>`, or `x:<key>` for hidden links.
 */
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

reviews.put("/:key", async (c) => {
  const parsed = parseReviewDecision(await c.req.json().catch(() => null));
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const review = { entityId: c.req.param("key"), decision: parsed.value, at: Date.now() };
  await c.env.DB.prepare(UPSERT_REVIEW).bind(review.entityId, JSON.stringify(review.decision), review.at).run();
  return c.json(review);
});

/** Undo: the guess comes back as it was. */
reviews.delete("/:key", async (c) => {
  const key = c.req.param("key");
  const now = Date.now();
  // Touch the linked thing so the next sync sends its card again.
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM reviews WHERE entity_id = ?").bind(key),
    c.env.DB.prepare(
      "UPDATE entities SET updated_at = ?1, data = json_set(data, '$.updatedAt', ?1) WHERE id = ?2",
    ).bind(now, key),
  ]);
  return c.json({ ok: true });
});
