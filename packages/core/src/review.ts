import { ENTITY_FIELDS } from "./import-export.js";
import { isMappable } from "./links.js";
import { readableLink } from "./text.js";
import type { Entity, ReviewDecision, UsefulLink } from "./types.js";

/**
 * Sid's answers to link guesses are kept apart from the guesses themselves (the `reviews` table),
 * so an answer can be undone. Everything that shows a linked thing passes it through
 * `applyReview` first, exactly as Orbit today does.
 *
 * Review keys: an entity id, `card-<itemId>` for a card with no linked thing, and
 * `x:<key>` for the links Sid hid on that thing (`{ d: "hide", urls }`).
 */

export const cardKey = (itemId: string): string => `card-${itemId}`;
export const hiddenKey = (key: string): string => `x:${key}`;

/** Fields a wrong guess loses. Name, location, category and the map search stay. */
const BLANKED = [
  "qid",
  "label",
  "description",
  "imdb",
  "igdb",
  "openLibrary",
  "wikipedia",
  "website",
  "unesco",
  "steam",
  "lat",
  "lng",
  "closed",
  "candidate",
  "alternatives",
] as const satisfies readonly (keyof Entity)[];

function blank(e: Entity): Entity {
  const out = { ...e };
  for (const k of BLANKED) delete out[k];
  return out;
}

/** A guess as Entity fields. Guesses from the old Orbit keep the export's short keys (`q`, `wp`...). */
export function guessFields(raw: Partial<Entity> | Record<string, unknown> | null | undefined): Partial<Entity> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [field, key, type] of ENTITY_FIELDS) {
    const v = r[field] ?? r[key];
    if (type === "n" ? typeof v === "number" && Number.isFinite(v) : typeof v === "string" && v) out[field] = v;
  }
  return out as Partial<Entity>;
}

/** The links Sid pasted, plus a search (and a map search for places) for text he typed. */
export function userLinksFor(
  e: Pick<Entity, "category" | "location">,
  fix: { url?: string; text?: string },
): UsefulLink[] {
  const out: UsefulLink[] = [];
  for (const url of (fix.url ?? "").split(/\s+/).filter((u) => /^https?:\/\/\S+\.\S+/i.test(u))) {
    out.push({ label: readableLink(url).label, url });
  }
  const text = fix.text?.trim();
  if (text) {
    const where = e.location ? ` ${e.location}` : "";
    out.push({ label: "Search", url: `https://www.google.com/search?q=${encodeURIComponent(text + where)}` });
    if (isMappable(e.category))
      out.push({
        label: "Map",
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text + (e.location ? `, ${e.location}` : ""))}`,
      });
  }
  return out;
}

/** The linked thing as Sid sees it, with his answer to the guess applied. */
export function applyReview(e: Entity, decision: ReviewDecision | null | undefined): Entity {
  if (!decision) return e;
  const keep = { id: e.id, name: e.name, category: e.category, updatedAt: e.updatedAt };
  const where = {
    ...(e.location ? { location: e.location } : {}),
    ...(e.mapQuery ? { mapQuery: e.mapQuery } : {}),
  };
  switch (decision.d) {
    case "yes":
      if (!e.candidate) return e;
      return { ...e, ...guessFields(e.candidate), ...keep, ...where, confidence: "high", reviewed: "yes" };
    case "no":
      return { ...blank(e), confidence: "rejected", reviewed: "no" };
    case "none": {
      const out: Entity = { ...blank(e), confidence: "nolink", reviewed: "none" };
      delete out.mapQuery;
      return out;
    }
    case "alt": {
      const pick = [e.candidate, ...(e.alternatives ?? [])].map(guessFields).find((g) => g.qid === decision.qid) ?? {
        qid: decision.qid,
        ...(decision.label ? { label: decision.label } : {}),
      };
      return { ...blank(e), ...pick, ...keep, ...where, confidence: "high", reviewed: "alt" };
    }
    case "fix": {
      const userLinks = userLinksFor(e, decision);
      if (decision.add) return { ...e, reviewed: "fix", userLinks };
      const out: Entity = { ...blank(e), confidence: "user", reviewed: "fix", userLinks };
      delete out.mapQuery;
      return out;
    }
    case "hide":
      return e;
  }
}

/** The links Sid hid on a thing or card, from its `x:` review. */
export function hiddenUrls(decision: ReviewDecision | null | undefined): Set<string> {
  return new Set(decision?.d === "hide" ? decision.urls : []);
}
