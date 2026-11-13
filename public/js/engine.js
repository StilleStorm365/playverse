// Deterministic game simulation. No DOM here, so it runs in Node tests too.
import { SPEED, STAR_BONUS_MS } from './level.js';

export const STEP = 1 / 120;      // fixed simulation step in seconds
export const HALF = 0.32;         // half the player's width, in tiles
const EPS = 1e-6;

function tileAt(level, x, y) {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (ty < 0 || ty >= level.tiles.length || tx < 0 || tx >= level.tiles[0].length) return '#';
  return level.tiles[ty][tx];
}

function blocked(level, x, y) {
  return tileAt(level, x - HALF, y - HALF) === '#' || tileAt(level, x + HALF - EPS, y - HALF) === '#' ||
         tileAt(level, x - HALF, y + HALF - EPS) === '#' || tileAt(level, x + HALF - EPS, y + HALF - EPS) === '#';
}

function findChar(level, ch) {
  for (let y = 0; y < level.tiles.length; y++) {
    const x = level.tiles[y].indexOf(ch);
    if (x >= 0) return { x, y };
  }
  return null;
}

export function createGame(level, spawn) {
  const s = spawn ?? findChar(level, 'S');
  return {
    level, type: level.type ?? 'race',
    x: s.x + 0.5, y: s.y + 0.5, spawn: { x: s.x + 0.5, y: s.y + 0.5 },
    started: false, finished: false, steps: 0, deaths: 0,
    stars: new Set(), portal: null, onPortal: null, facing: 1,
  };
}

/** Advance one fixed step. `input` is {dx, dy} in [-1, 1]. Returns a list of events. */
export function step(g, input) {
  const events = [];
  if (g.finished) return events;
  let { dx, dy } = input;
  const len = Math.sqrt(dx * dx + dy * dy); // sqrt is exactly rounded everywhere; hypot is not (replays must match)
  if (len > 1) { dx /= len; dy /= len; }
  if (!g.started) {
    if (len === 0) return events;
    g.started = true; events.push({ type: 'start' });
  }
  g.steps++;
  if (dx) g.facing = Math.sign(dx);

  const d = SPEED * STEP;
  const nx = g.x + dx * d;
  if (!blocked(g.level, nx, g.y)) g.x = nx;
  else if (dx > 0) g.x = Math.floor(nx + HALF) - HALF;
  else if (dx < 0) g.x = Math.floor(nx - HALF) + 1 + HALF;
  const ny = g.y + dy * d;
  if (!blocked(g.level, g.x, ny)) g.y = ny;
  else if (dy > 0) g.y = Math.floor(ny + HALF) - HALF;
  else if (dy < 0) g.y = Math.floor(ny - HALF) + 1 + HALF;

  const cx = Math.floor(g.x), cy = Math.floor(g.y);
  const c = tileAt(g.level, g.x, g.y);
  if (c === '^') {
    g.deaths++; g.x = g.spawn.x; g.y = g.spawn.y;
    events.push({ type: 'death' });
  } else if (c === '*' && !g.stars.has(`${cx},${cy}`)) {
    g.stars.add(`${cx},${cy}`); events.push({ type: 'star' });
  } else if (c === 'G' && g.type === 'race') {
    g.finished = true; events.push({ type: 'finish', timeMs: resultMs(g) });
  }

  if (g.type === 'hub') {
    const p = (g.level.portals || []).find((p) => p.x === cx && p.y === cy) || null;
    if (p && g.onPortal !== p) events.push({ type: 'portal', portal: p });
    g.onPortal = p;
  }
  return events;
}

export function elapsedMs(g) { return Math.round(g.steps * STEP * 1000); }
export function resultMs(g) { return Math.max(0, elapsedMs(g) - g.stars.size * STAR_BONUS_MS); }
export function starTaken(g, x, y) { return g.stars.has(`${x},${y}`); }
