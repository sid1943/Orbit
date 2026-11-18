/**
 * Orbit data model.
 *
 * Everything Sid tracks is an Item (a movie, a book, a trip, a to-do...).
 * An Item can hold checklists, and each checklist row can point at a Linked thing (an Entity):
 * the real-world movie, book, game or place, with its standard link (IMDb, Open Library, IGDB, map).
 */

export const STATUSES = ["todo", "doing", "done", "dropped"] as const;
export type Status = (typeof STATUSES)[number];

export const KINDS = [
  "To-do",
  "Experience",
  "Place",
  "Movie",
  "Show",
  "Book",
  "Game",
  "Podcast",
  "Recipe",
  "Learning",
  "Thing",
  "Money",
  "Note",
] as const;
export type Kind = (typeof KINDS)[number];

/** One line in a checklist. `ref` points at another Item, `entityId` at a linked thing. */
export interface ChecklistRow {
  text: string;
  done: boolean;
  ref?: string | null;
  entityId?: string | null;
}

export interface Checklist {
  name: string;
  rows: ChecklistRow[];
}

/** A link Sid added or that came with an item: [label, url, note?] */
export interface UsefulLink {
  label: string;
  url: string;
  note?: string;
}

export interface Comment {
  date: string; // YYYY-MM-DD
  text: string;
}

export interface Item {
  id: string;
  kind: Kind | string;
  title: string;
  status: Status;
  tags: string[];
  /** Where it came from, e.g. "Imported from Trello: Books › Want to Read" */
  source: string;
  /** Free-form details such as Quest, Genre, Watch on, Year */
  props: Record<string, string>;
  notes: string;
  due: string | null; // YYYY-MM-DD
  start: string | null;
  archived: boolean;
  deleted: boolean;
  /** The item itself as a linked thing (e.g. a movie card linked to its IMDb title) */
  entityId: string | null;
  /** Other Orbit items this one points at */
  refs: string[];
  links: UsefulLink[];
  attachments: UsefulLink[];
  comments: Comment[];
  checklists: Checklist[];
  coverId: string | null;
  createdAt: number;
  updatedAt: number;
}

/** How sure the matcher is that an Entity is the right real-world thing. */
export type Confidence =
  | "high" // confirmed
  | "review" // plausible guess, waiting for Sid
  | "none" // nothing found
  | "map" // a place known only by name and location: map link only
  | "nolink" // not a real-world thing (a header, a note)
  | "user" // Sid set the link himself
  | "rejected"; // Sid said the guess was wrong and hasn't said what it is yet

export type EntityCategory =
  | "movie"
  | "show"
  | "book"
  | "game"
  | "natural_place"
  | "building"
  | "us_park"
  | "ballpark"
  | "museum"
  | "pagoda"
  | "district"
  | "nyc"
  | "nyc_building"
  | "city_todo"
  | "eatery"
  | "burger"
  | "chain"
  | "done_place"
  | "trip"
  | "festival"
  | "sport_event"
  | "show_taping"
  | "phenomenon"
  | "fed_bank"
  | "card"
  | string;

/** A real-world thing an Item or checklist row is about. */
export interface Entity {
  id: string;
  name: string;
  category: EntityCategory;
  confidence: Confidence;
  /** Wikidata QID */
  qid?: string;
  label?: string;
  description?: string;
  /** IMDb title id (tt...) for movies and TV */
  imdb?: string;
  /** IGDB slug for games */
  igdb?: string;
  /** Open Library work id (OL...W) for books */
  openLibrary?: string;
  author?: string;
  year?: number;
  wikipedia?: string;
  website?: string;
  unesco?: string;
  steam?: string;
  lat?: number;
  lng?: number;
  location?: string;
  /** Text to search on a map when there are no coordinates */
  mapQuery?: string;
  closed?: string;
  /** The best guess while confidence is "review" */
  candidate?: Partial<Entity>;
  alternatives?: Partial<Entity>[];
  /** Set when Sid answered a guess or fixed the link (see `applyReview`). */
  reviewed?: ReviewDecision["d"];
  /** Links Sid pasted or typed in "Fix links". */
  userLinks?: UsefulLink[];
  updatedAt: number;
}

/** Sid's answer to a link guess. */
export type ReviewDecision =
  | { d: "yes" }
  | { d: "no" }
  | { d: "none" }
  | { d: "alt"; qid: string; label?: string }
  | { d: "fix"; url?: string; text?: string; add?: boolean }
  | { d: "hide"; urls: string[] };

export interface Review {
  entityId: string;
  decision: ReviewDecision;
  at: number;
}

/** Where something can be watched in one country (TMDB watch providers, data from JustWatch). */
export interface WatchOn {
  country: string;
  /** Included with a subscription (Netflix, Max...). */
  stream: string[];
  rent: string[];
  buy: string[];
  /** Free with ads. */
  free?: string[];
  /** The channel or service a show is made for (TVmaze network or web channel). */
  network?: string;
  /** TMDB's page listing the offers. */
  link?: string;
}

/** Live facts refreshed from outside sources (TV seasons, next episode, release dates). */
export interface LiveStatus {
  entityId: string;
  source: "tvmaze" | "wikidata" | "openlibrary" | "igdb" | "tmdb";
  status?: string; // e.g. "Running", "Ended", "To Be Determined"
  seasons?: number;
  nextEpisode?: { date: string; name?: string; season?: number; number?: number } | null;
  lastEpisode?: { date: string; season?: number; number?: number } | null;
  /** Release or first publication date (YYYY-MM-DD, or YYYY when only the year is known). */
  releaseDate?: string;
  /** When a place closed for good (YYYY-MM-DD or YYYY), from Wikidata. */
  closed?: string;
  /** Where to watch it in Sid's country (TMDB, data from JustWatch, which must be credited where shown). */
  watchOn?: WatchOn;
  /** US release dates by kind (TMDB): theatres, digital (streaming / rent), physical. */
  releases?: { theatrical?: string; digital?: string; physical?: string };
  /** In US theatres now: a theatrical release in the last 60 days and no digital release yet. */
  inTheatres?: boolean;
  /** The movie's TMDB collection (its series), with every part in release order: how sequels show up. */
  collection?: { id: number; name: string; parts: { tmdbId: number; title: string; releaseDate?: string }[] };
  /** Games (IGDB): development status, e.g. "Released", "Early access", "Beta", "In development", "Cancelled". */
  devStatus?: string;
  platforms?: string[];
  /** Games (IGDB): each platform's release, with its own date and status. */
  platformReleases?: { platform: string; date?: string; status?: string }[];
  checkedAt: number;
}
