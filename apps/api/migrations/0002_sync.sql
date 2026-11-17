-- Orbit schema v2: what the card list sync (GET /api/sync) needs.
-- The light fields it sends (topics, details, checklist progress) are read straight from each
-- card's JSON, so existing cards need no back-fill.

-- Cards removed for good (DELETE /api/items/:id?hard=1), so other devices drop them too.
CREATE TABLE removed (
  id          TEXT PRIMARY KEY,
  removed_at  INTEGER NOT NULL
);
CREATE INDEX removed_at ON removed(removed_at);

-- Sync asks for "changed since", which also looks at linked things, covers and review answers.
CREATE INDEX entities_updated ON entities(updated_at);
CREATE INDEX covers_fetched ON covers(fetched_at);
CREATE INDEX reviews_at ON reviews(at);
