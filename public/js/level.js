// Level format, validation and analysis. Shared by the browser and tools/validate.mjs.
// A level is pure data: no code, no URLs. See docs/teknisk-skitse.md.

export const LIMITS = { maxWidth: 32, maxHeight: 18, minSize: 3, maxBytes: 8192, maxStars: 5, maxPortals: 12 };
export const SPEED = 5;              // tiles per second (must match engine.js)
export const STAR_BONUS_MS = 500;    // each star subtracts this from the time
const TILE_CHARS = new Set(['#', '.', '^', 'S', 'G', '*']);
const KEYS = new Set(['id', 'version', 'title', 'author', 'type', 'tiles', 'portals']);
const ID_RE = /^[a-z0-9][a-z0-9-]{1,31}$/;

function findAll(tiles, ch) {
  const out = [];
  tiles.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === ch) out.push({ x, y }); });
  return out;
}

// 4-connected flood fill over tiles a player can stand on (not walls, not spikes).
export function reachable(tiles, from) {
  const h = tiles.length, w = tiles[0].length;
  const seen = new Set([from.y * w + from.x]);
  const queue = [from];
  while (queue.length) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const c = tiles[ny][nx];
      if (c === '#' || c === '^') continue;
      const k = ny * w + nx;
      if (!seen.has(k)) { seen.add(k); queue.push({ x: nx, y: ny }); }
    }
  }
  return (p) => seen.has(p.y * w + p.x);
}

// Shortest 8-connected path lengths (in tiles) from one tile to every tile.
// Diagonal steps are only allowed when both side tiles are open (no corner cutting).
function distances(tiles, from) {
  const h = tiles.length, w = tiles[0].length;
  const open = (x, y) => x >= 0 && y >= 0 && x < w && y < h && tiles[y][x] !== '#' && tiles[y][x] !== '^';
  const dist = new Float64Array(w * h).fill(Infinity);
  dist[from.y * w + from.x] = 0;
  const done = new Uint8Array(w * h);
  for (;;) {
    let best = -1;
    for (let i = 0; i < dist.length; i++) if (!done[i] && dist[i] < Infinity && (best < 0 || dist[i] < dist[best])) best = i;
    if (best < 0) break;
    done[best] = 1;
    const x = best % w, y = (best - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!open(nx, ny)) continue;
      if (dx && dy && (!open(x + dx, y) || !open(x, y + dy))) continue;
      const nd = dist[best] + (dx && dy ? Math.SQRT2 : 1);
      if (nd < dist[ny * w + nx]) dist[ny * w + nx] = nd;
    }
  }
  return (p) => dist[p.y * w + p.x];
}

// Lower bound on a legitimate finishing time, used to reject impossible scores.
// For every subset and order of stars: path S -> stars -> G at full speed, minus the star bonus.
// The path is shortened by 15% and 1 tile because the player moves at any angle and
// finishes as soon as its centre enters the goal tile.
export function minTimeMs(level) {
  const t = level.tiles;
  const s = findAll(t, 'S')[0], g = findAll(t, 'G')[0];
  if (!s || !g) return 0;
  const stars = findAll(t, '*');
  const pts = [s, ...stars, g];
  const d = pts.map((p) => { const f = distances(t, p); return pts.map(f); });
  const goal = pts.length - 1;
  let best = Infinity;
  const visit = (at, used, len, count) => {
    const total = len + d[at][goal];
    const ms = Math.max(0, total * 0.85 - 1) / SPEED * 1000 - count * STAR_BONUS_MS;
    if (ms < best) best = ms;
    for (let i = 1; i <= stars.length; i++) if (!(used & (1 << i))) visit(i, used | (1 << i), len + d[at][i], count + 1);
  };
  visit(0, 1, 0, 0);
  return Math.max(0, Math.floor(best));
}

/**
 * Validate a parsed level object. `bytes` is the size of the source file if known.
 * Returns { ok, errors: string[], info: { type, width, height, stars, minTimeMs } }.
 */
export function validateLevel(obj, { bytes } = {}) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (bytes !== undefined && bytes > LIMITS.maxBytes) err(`file is ${bytes} bytes, max ${LIMITS.maxBytes}`);
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['level must be a JSON object'], info: {} };

  for (const k of Object.keys(obj)) if (!KEYS.has(k)) err(`unknown field "${k}"`);
  if (typeof obj.id !== 'string' || !ID_RE.test(obj.id)) err('id must be 2-32 chars: lowercase letters, digits, dashes');
  if (!Number.isInteger(obj.version) || obj.version < 1) err('version must be an integer >= 1');
  if (typeof obj.title !== 'string' || obj.title.trim().length < 1 || obj.title.length > 40) err('title must be 1-40 characters');
  if (typeof obj.author !== 'string' || obj.author.trim().length < 1 || obj.author.length > 32) err('author must be 1-32 characters');
  const type = obj.type ?? 'race';
  if (type !== 'race' && type !== 'hub') err('type must be "race" or "hub"');

  const t = obj.tiles;
  if (!Array.isArray(t) || t.length < LIMITS.minSize || t.length > LIMITS.maxHeight || !t.every((r) => typeof r === 'string')) {
    err(`tiles must be ${LIMITS.minSize}-${LIMITS.maxHeight} strings`);
    return { ok: false, errors, info: {} };
  }
  const width = t[0].length;
  if (width < LIMITS.minSize || width > LIMITS.maxWidth) err(`rows must be ${LIMITS.minSize}-${LIMITS.maxWidth} characters wide`);
  t.forEach((row, y) => {
    if (row.length !== width) err(`row ${y} is ${row.length} wide, expected ${width}`);
    for (const ch of row) if (!TILE_CHARS.has(ch)) { err(`row ${y} has invalid character "${ch}"`); break; }
  });
  if (errors.length) return { ok: false, errors, info: {} };

  const starts = findAll(t, 'S'), goals = findAll(t, 'G'), stars = findAll(t, '*');
  if (starts.length !== 1) err(`need exactly one start "S", found ${starts.length}`);
  if (type === 'race') {
    if (goals.length !== 1) err(`need exactly one goal "G", found ${goals.length}`);
    if (stars.length > LIMITS.maxStars) err(`at most ${LIMITS.maxStars} stars, found ${stars.length}`);
    if (obj.portals !== undefined) err('only hub levels can have portals');
  } else {
    if (goals.length || stars.length) err('hub levels cannot have goals or stars');
    if (!Array.isArray(obj.portals) || obj.portals.length < 1 || obj.portals.length > LIMITS.maxPortals) err(`hub needs 1-${LIMITS.maxPortals} portals`);
  }
  if (errors.length) return { ok: false, errors, info: {} };

  const canReach = reachable(t, starts[0]);
  if (type === 'race') {
    if (!canReach(goals[0])) err('the goal cannot be reached from the start');
    stars.forEach((s) => { if (!canReach(s)) err(`star at ${s.x},${s.y} cannot be reached`); });
  } else {
    const seen = new Set();
    obj.portals.forEach((p, i) => {
      if (!p || typeof p !== 'object' || !Number.isInteger(p.x) || !Number.isInteger(p.y) || typeof p.levelId !== 'string' || !ID_RE.test(p.levelId)) {
        err(`portal ${i} must be {x, y, levelId}`); return;
      }
      for (const k of Object.keys(p)) if (k !== 'x' && k !== 'y' && k !== 'levelId') err(`portal ${i} has unknown field "${k}"`);
      if (p.x < 0 || p.y < 0 || p.x >= width || p.y >= t.length || t[p.y][p.x] !== '.') { err(`portal ${i} must sit on a floor tile`); return; }
      if (!canReach(p)) err(`portal ${i} cannot be reached`);
      const k = `${p.x},${p.y}`;
      if (seen.has(k)) err(`portal ${i} overlaps another portal`);
      seen.add(k);
    });
  }

  const info = { type, width, height: t.length, stars: stars.length, minTimeMs: type === 'race' ? minTimeMs(obj) : 0 };
  return { ok: errors.length === 0, errors, info };
}
