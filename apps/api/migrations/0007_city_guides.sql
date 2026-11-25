-- Orbit schema v7: the city rule. Cities Orbit suggests places for, what it found for each, and
-- the details (hours, fees, history...) of each suggested place.
CREATE TABLE cities (
  key         TEXT PRIMARY KEY,          -- lower-case name, "san jose, ca"
  name        TEXT NOT NULL,
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  qid         TEXT,                      -- Wikidata id, found in the first step
  source      TEXT NOT NULL,             -- 'places' (from Sid's places) or 'added'
  step        INTEGER NOT NULL DEFAULT 0, -- next of GUIDE_STEPS to run
  next_check  INTEGER,                   -- when the next step may run (null: not before Sid adds it again)
  checked_at  INTEGER,
  done_at     INTEGER,                   -- when the last full pass finished
  error       TEXT,
  failures    INTEGER NOT NULL DEFAULT 0,
  off         INTEGER NOT NULL DEFAULT 0  -- Sid turned the city off; discovery leaves it off
);
CREATE INDEX cities_due ON cities(next_check) WHERE next_check IS NOT NULL;

CREATE TABLE city_suggestions (
  city        TEXT NOT NULL,
  qid         TEXT NOT NULL,
  grp         TEXT NOT NULL,             -- nature, culture, food, experiences, connections
  data        TEXT NOT NULL,             -- Suggestion or CityWork JSON
  fame        INTEGER NOT NULL DEFAULT 0,
  seen_at     INTEGER NOT NULL,
  hidden      INTEGER NOT NULL DEFAULT 0, -- Sid marked it wrong
  PRIMARY KEY (city, qid)
);
CREATE INDEX city_suggestions_qid ON city_suggestions(qid);

CREATE TABLE place_details (
  qid         TEXT PRIMARY KEY,
  data        TEXT NOT NULL,             -- PlaceDetails JSON
  fetched_at  INTEGER NOT NULL,
  next_check  INTEGER NOT NULL
);
