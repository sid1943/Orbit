-- Orbit schema v3: live watch (what each linked thing needs, see packages/core/src/watch.ts)
-- and the dead-link check for links Sid pasted (packages/core/src/link-check.ts).

-- One row per linked thing: what to watch, from where, and when to look again.
-- `replan` = 1 when its card, rows or review answer changed since the rule was last worked out.
-- `next_check` is NULL once stopped (`stop` says why).
CREATE TABLE watch (
  entity_id   TEXT PRIMARY KEY,
  what        TEXT,
  source      TEXT,
  key         TEXT,
  ref         TEXT,
  next_check  INTEGER,
  stop        TEXT,
  misses      INTEGER NOT NULL DEFAULT 0,
  checked_at  INTEGER,
  replan      INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX watch_due ON watch(next_check) WHERE next_check IS NOT NULL;
CREATE INDEX watch_replan ON watch(replan) WHERE replan = 1;

-- One row per pasted address. `owner` is a card id, or a linked thing's id for "Fix links" addresses.
CREATE TABLE link_checks (
  url         TEXT PRIMARY KEY,
  owner       TEXT NOT NULL,
  state       TEXT NOT NULL DEFAULT 'new',
  http_status INTEGER,
  misses      INTEGER NOT NULL DEFAULT 0,
  checked_at  INTEGER,
  next_check  INTEGER
);
CREATE INDEX link_checks_due ON link_checks(next_check) WHERE next_check IS NOT NULL;
CREATE INDEX link_checks_owner ON link_checks(owner);
CREATE INDEX link_checks_state ON link_checks(state);

-- Small bookkeeping for the scheduled jobs (e.g. `changes_since`: the last run's start time).
CREATE TABLE job_state (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL
);
