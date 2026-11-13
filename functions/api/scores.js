// Cloudflare Pages Function: GET/POST /api/scores
// Scores are untrusted (no login). Every run comes with its input replay, which we re-simulate
// with the same engine as the browser: the time on the board is the simulated time, not a claim.
// We also check the published level file and a minimum-time bound, filter nicknames, and
// rate-limit by a salted IP hash.
import { validateLevel, minTimeMs } from '../../public/js/level.js';
import { checkReplay, simulate } from '../../public/js/replay.js';
import { NICK_RE, blocked } from '../../public/js/community.js';
import { json, ipHash } from '../../lib/server.js';

const ID_RE = /^[a-z0-9][a-z0-9-]{1,31}$/;
const MAX_BODY = 64 * 1024;
const RATE_PER_MINUTE = 10;
const TOP = 10;


async function loadLevel(env, request, levelId, version) {
  const url = new URL(`/levels/${levelId}/v${version}.json`, request.url);
  const r = await env.ASSETS.fetch(url);
  if (!r.ok) return null;
  const text = await r.text();
  let level;
  try { level = JSON.parse(text); } catch { return null; }
  const res = validateLevel(level, { bytes: new TextEncoder().encode(text).length });
  if (!res.ok || level.type === 'hub' || level.id !== levelId || level.version !== version) return null;
  return level;
}

async function top(env, levelId, version) {
  const { results } = await env.DB.prepare(
    `SELECT nickname, MIN(time_ms) AS timeMs FROM scores
     WHERE level_id = ? AND version = ? GROUP BY nickname ORDER BY timeMs ASC, MIN(created_at) ASC LIMIT ?`
  ).bind(levelId, version, TOP).all();
  return results;
}


function parseQuery(url) {
  const levelId = url.searchParams.get('levelId') || '';
  const version = Number(url.searchParams.get('version'));
  return { levelId, version };
}

export async function onRequestGet({ request, env }) {
  const { levelId, version } = parseQuery(new URL(request.url));
  if (!ID_RE.test(levelId) || !Number.isInteger(version) || version < 1) return json({ error: 'Bad level or version' }, 400);
  const out = { levelId, version, scores: await top(env, levelId, version) };
  if (new URL(request.url).searchParams.get('ghost') === '1') out.ghost = await recordGhost(env, levelId, version);
  return json(out);
}

// The fastest run that has a replay (runs from before replays existed have none).
async function recordGhost(env, levelId, version) {
  const row = await env.DB.prepare(
    `SELECT nickname, time_ms AS timeMs, replay FROM scores
     WHERE level_id = ? AND version = ? AND replay IS NOT NULL ORDER BY time_ms ASC, created_at ASC LIMIT 1`
  ).bind(levelId, version).first();
  if (!row) return null;
  try { return { nickname: row.nickname, timeMs: row.timeMs, replay: JSON.parse(row.replay) }; } catch { return null; }
}

export async function onRequestPost({ request, env }) {
  if ((request.headers.get('content-type') || '').split(';')[0] !== 'application/json') return json({ error: 'Expected JSON' }, 415);
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: 'Too large' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { levelId, version, replay } = body || {};
  const nickname = typeof body?.nickname === 'string' ? body.nickname.trim() : '';

  if (typeof levelId !== 'string' || !ID_RE.test(levelId) || !Number.isInteger(version) || version < 1) return json({ error: 'Bad level or version' }, 400);
  if (!NICK_RE.test(nickname)) return json({ error: 'Nickname must be 2-16 letters, digits, space, _ or -' }, 400);
  if (blocked(nickname)) return json({ error: 'Please choose another nickname' }, 400);
  const replayError = checkReplay(replay);
  if (replayError) return json({ error: `Bad replay: ${replayError}` }, 400);

  const level = await loadLevel(env, request, levelId, version);
  if (!level) return json({ error: 'Unknown level version' }, 404);

  // Rate limit before the (cheap, but not free) simulation.
  const now = Date.now();
  const hash = await ipHash(env, request);
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE ip_hash = ? AND created_at > ?').bind(hash, now - 60_000).first();
  if (n >= RATE_PER_MINUTE) return json({ error: 'Too many submissions, try again in a minute' }, 429);

  const run = simulate(level, replay);
  if (!run.finished) return json({ error: 'The replay does not reach the goal' }, 422);
  const timeMs = run.timeMs;
  if (timeMs < minTimeMs(level)) return json({ error: 'That time is not possible on this level' }, 422);

  await env.DB.prepare('INSERT INTO scores (level_id, version, nickname, time_ms, created_at, ip_hash, replay) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(levelId, version, nickname, timeMs, now, hash, JSON.stringify(replay)).run();

  // Rank among best-per-nickname times.
  const { better } = await env.DB.prepare(
    `SELECT COUNT(*) AS better FROM (SELECT nickname, MIN(time_ms) AS t FROM scores WHERE level_id = ? AND version = ? GROUP BY nickname)
     WHERE t < (SELECT MIN(time_ms) FROM scores WHERE level_id = ? AND version = ? AND nickname = ?)`
  ).bind(levelId, version, levelId, version, nickname).first();
  return json({ ok: true, nickname, timeMs, rank: better + 1, scores: await top(env, levelId, version) }, 201);
}
