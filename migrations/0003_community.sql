-- Community portals (placed on a pad in the hub) and multiplayer-game suggestions for the duo Vibe Jam portal.
-- Live at once, with limits: https only, a daily cap per person, hidden after REPORTS_TO_HIDE reports.
CREATE TABLE portals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('portal', 'jam')),  -- 'portal' sits on a hub pad; 'jam' only feeds the duo list
  pad INTEGER,                                           -- pad index in the published hub (NULL for 'jam')
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  multiplayer INTEGER NOT NULL DEFAULT 0,
  nickname TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  owner_hash TEXT NOT NULL,                              -- SHA-256 of a random token kept in the creator's browser
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX portals_pad_taken ON portals (pad) WHERE kind = 'portal' AND hidden = 0;
CREATE INDEX portals_ip ON portals (ip_hash, created_at);
CREATE INDEX portals_owner ON portals (owner_hash, created_at);

CREATE TABLE reports (
  portal_id INTEGER NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (portal_id, ip_hash)
);

-- One known multiplayer jam game so the duo portal works from day one (everyone flies in one shared world).
INSERT INTO portals (kind, pad, title, url, multiplayer, nickname, ip_hash, owner_hash, created_at, expires_at)
VALUES ('jam', NULL, 'Fly (levelsio)', 'https://fly.pieter.com/', 1, 'Playverse', 'seed', 'seed', 0, 253402300799000);
