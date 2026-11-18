import type { Entity } from "./types.js";

/** One standard source per kind of thing, so every link in Orbit looks and behaves the same. */
export interface BuiltLink {
  label: string;
  url: string;
}

/** Kinds of things that are not places, so they never get a map link. */
const NO_MAP = new Set(["movie", "show", "book", "game", "festival", "show_taping", "event", "phenomenon", "trip"]);

/** Whether a linked thing of this category can sit on a map. */
export const isMappable = (category: string): boolean => !NO_MAP.has(category);

export function entityLinks(e: Entity): BuiltLink[] {
  const out: BuiltLink[] = [];
  if (e.imdb) out.push({ label: "IMDb", url: `https://www.imdb.com/title/${encodeURIComponent(e.imdb)}/` });
  if (e.igdb) out.push({ label: "IGDB", url: `https://www.igdb.com/games/${encodeURIComponent(e.igdb)}` });
  // Books: Goodreads for every book (Sid, 2026-11-17). Open Library stays behind the scenes (matching, covers).
  if (e.category === "book") {
    const gr = goodreadsLink(e);
    if (gr) out.push(gr);
  } else if (e.openLibrary)
    out.push({ label: "Open Library", url: `https://openlibrary.org/works/${encodeURIComponent(e.openLibrary)}` });
  if (e.wikipedia)
    out.push({
      label: "Wikipedia",
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(e.wikipedia.replace(/ /g, "_"))}`,
    });
  if (e.steam) out.push({ label: "Steam", url: `https://store.steampowered.com/app/${encodeURIComponent(e.steam)}/` });
  if (!NO_MAP.has(e.category)) {
    const q =
      e.lat != null && e.lng != null
        ? `${e.lat},${e.lng}`
        : (e.mapQuery ?? (e.location ? `${e.name} ${e.location}` : null));
    if (q)
      out.push({
        label: e.category === "chain" ? "Find nearby" : "Map",
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,
      });
  }
  if (e.website) out.push({ label: "Official site", url: e.website });
  if (e.unesco) out.push({ label: "UNESCO", url: `https://whc.unesco.org/en/list/${encodeURIComponent(e.unesco)}` });
  return out;
}

/**
 * A book's Goodreads link. With a Goodreads work id it opens the book's page (Goodreads sends
 * `/work/best_book/<id>` to its best-known edition); with a book id, that edition's page. Without
 * either, a Goodreads search for the title and author, so every book has a link. Nothing for a
 * row that isn't a real book (`nolink`).
 */
export function goodreadsLink(
  e: Pick<Entity, "name" | "label" | "author" | "confidence" | "goodreads" | "goodreadsBook">,
): BuiltLink | null {
  if (e.goodreads)
    return { label: "Goodreads", url: `https://www.goodreads.com/work/best_book/${encodeURIComponent(e.goodreads)}` };
  if (e.goodreadsBook)
    return { label: "Goodreads", url: `https://www.goodreads.com/book/show/${encodeURIComponent(e.goodreadsBook)}` };
  if (e.confidence === "nolink") return null;
  const title = (e.label ?? e.name).trim();
  if (!title) return null;
  const q = e.author && !title.toLowerCase().includes(e.author.toLowerCase()) ? `${title} ${e.author}` : title;
  return { label: "Goodreads", url: `https://www.goodreads.com/search?q=${encodeURIComponent(q)}` };
}
