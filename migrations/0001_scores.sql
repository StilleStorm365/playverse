-- Leaderboard: one row per submitted run. Times are stored per level version.
CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  level_id   TEXT    NOT NULL,
  version    INTEGER NOT NULL,
  nickname   TEXT    NOT NULL,
  time_ms    INTEGER NOT NULL,
  created_at INTEGER NOT NULL,  -- unix ms
  ip_hash    TEXT    NOT NULL   -- salted SHA-256, only for rate limiting
);
CREATE INDEX IF NOT EXISTS scores_board ON scores (level_id, version, time_ms);
CREATE INDEX IF NOT EXISTS scores_rate  ON scores (ip_hash, created_at);
