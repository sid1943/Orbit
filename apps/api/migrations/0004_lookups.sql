-- Orbit schema v4: when an extra id was last looked up for a linked thing (and when to look again),
-- one row per kind of lookup. First kind: 'goodreads' (Goodreads ids for books).
CREATE TABLE lookup_state (
  entity_id   TEXT NOT NULL,
  kind        TEXT NOT NULL,
  checked_at  INTEGER NOT NULL,
  next_check  INTEGER NOT NULL,
  status      TEXT NOT NULL,
  PRIMARY KEY (entity_id, kind)
);
CREATE INDEX lookup_state_next ON lookup_state(kind, next_check);
