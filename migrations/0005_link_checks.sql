-- A daily check of the linked pages (the room Worker's cron, room/src/links.js).
-- Both the duo portal and a lone player now get a game from this list, so a game that has
-- disappeared would otherwise send everyone to a dead page (Tommy hit one on 14/11).
ALTER TABLE portals ADD COLUMN checked_at INTEGER;          -- when we last asked
ALTER TABLE portals ADD COLUMN last_status INTEGER;         -- HTTP status, 0 = no answer
ALTER TABLE portals ADD COLUMN fails INTEGER NOT NULL DEFAULT 0;   -- checks in a row that failed
