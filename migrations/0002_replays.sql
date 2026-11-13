-- Ghosts: the input replay of each run (JSON, see public/js/replay.js). NULL for runs from before replays.
ALTER TABLE scores ADD COLUMN replay TEXT;
