-- Orbit schema v1.
-- Each row keeps the full record as JSON in `data`; the columns beside it
-- are copies used for filtering and sorting.

CREATE TABLE items (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'todo',
  archived    INTEGER NOT NULL DEFAULT 0,
  deleted     INTEGER NOT NULL DEFAULT 0,
  entity_id   TEXT,
  due         TEXT,
  data        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX items_kind ON items(kind, status);
CREATE INDEX items_updated ON items(updated_at);
CREATE INDEX items_entity ON items(entity_id);

CREATE TABLE entities (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  confidence  TEXT NOT NULL,
  imdb        TEXT,
  data        TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX entities_conf ON entities(confidence);
CREATE INDEX entities_cat ON entities(category);

-- Sid's answers to link guesses.
CREATE TABLE reviews (
  entity_id   TEXT PRIMARY KEY,
  decision    TEXT NOT NULL,
  at          INTEGER NOT NULL
);

-- Settings: font, size, theme, home location...
CREATE TABLE prefs (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Live facts (TV seasons, next episode...).
CREATE TABLE live (
  entity_id   TEXT PRIMARY KEY,
  source      TEXT NOT NULL,
  data        TEXT NOT NULL,
  checked_at  INTEGER NOT NULL,
  next_check  INTEGER NOT NULL
);
CREATE INDEX live_next ON live(next_check);

-- Cover images (links to Open Library, TVmaze or Wikimedia; the web app loads them directly).
CREATE TABLE covers (
  entity_id   TEXT PRIMARY KEY,
  url         TEXT NOT NULL,
  source      TEXT NOT NULL,
  fetched_at  INTEGER NOT NULL
);

-- New or changed items waiting for the enricher.
-- mode 'new': added in Orbit, unsure matches go to review.
-- mode 'backfill': old cards from the import, only sure matches are kept.
CREATE TABLE enrich_queue (
  item_id     TEXT PRIMARY KEY,
  mode        TEXT NOT NULL DEFAULT 'new',
  attempts    INTEGER NOT NULL DEFAULT 0,
  not_before  INTEGER NOT NULL,
  last_error  TEXT,
  created_at  INTEGER NOT NULL
);
