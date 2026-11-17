-- Orbit schema v3: connections between things (series, sequels, based on, franchise), from Wikidata.
-- Connected things don't have to be in Orbit, so they live in their own table, keyed by Wikidata id.

-- A real-world thing by Wikidata id: name, type, year and ids (JSON, see core `Work`).
CREATE TABLE works (
  qid         TEXT PRIMARY KEY,
  data        TEXT NOT NULL,
  fetched_at  INTEGER NOT NULL
);

-- One connection in its stored direction (see core `Relation`): from is part of / comes after /
-- was made from / belongs to `to_qid`. `ord` is the position in a series.
CREATE TABLE relations (
  from_qid    TEXT NOT NULL,
  rel         TEXT NOT NULL,
  to_qid      TEXT NOT NULL,
  ord         REAL,
  seen_at     INTEGER NOT NULL,
  PRIMARY KEY (from_qid, rel, to_qid)
);
CREATE INDEX relations_to ON relations(to_qid, rel);

-- When each linked thing was last connected (or tried, when no Wikidata id was found) and is next due.
CREATE TABLE connect_state (
  entity_id   TEXT PRIMARY KEY,
  checked_at  INTEGER NOT NULL,
  next_check  INTEGER NOT NULL,
  status      TEXT NOT NULL
);
CREATE INDEX connect_state_next ON connect_state(next_check);

-- Cards are found by their linked thing's Wikidata id.
CREATE INDEX entities_qid ON entities(json_extract(data, '$.qid'));
