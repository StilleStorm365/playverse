// Cloudflare Pages Function: GET/POST /api/scores
// Scores are untrusted (no login). We validate against the published level file and a
// minimum-time bound, filter nicknames, and rate-limit by a salted IP hash.
import { validateLevel, minTimeMs } from '../../public/js/level.js';

const ID_RE = /^[a-z0-9][a-z0-9-]{1,31}$/;
const NICK_RE = /^[A-Za-z0-9 _-]{2,16}$/;
const MAX_TIME_MS = 10 * 60 * 1000;
const RATE_PER_MINUTE = 10;
const TOP = 10;
// Small, conservative blocklist; matched against the nickname with spaces/_/- removed.
const BLOCK = ['fuck', 'shit', 'cunt', 'nigg', 'fag', 'nazi', 'hitler', 'rape', 'whore', 'slut', 'admin', 'moderator', 'playverse'];

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

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

async function ipHash(env, request) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const salt = env.IP_SALT || 'dev-salt';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function parseQuery(url) {
  const levelId = url.searchParams.get('levelId') || '';
  const version = Number(url.searchParams.get('version'));
  return { levelId, version };
}

export async function onRequestGet({ request, env }) {
  const { levelId, version } = parseQuery(new URL(request.url));
  if (!ID_RE.test(levelId) || !Number.isInteger(version) || version < 1) return json({ error: 'Bad level or version' }, 400);
  return json({ levelId, version, scores: await top(env, levelId, version) });
}

export async function onRequestPost({ request, env }) {
  if ((request.headers.get('content-type') || '').split(';')[0] !== 'application/json') return json({ error: 'Expected JSON' }, 415);
  const raw = await request.text();
  if (raw.length > 1024) return json({ error: 'Too large' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { levelId, version, timeMs } = body || {};
  const nickname = typeof body?.nickname === 'string' ? body.nickname.trim() : '';

  if (typeof levelId !== 'string' || !ID_RE.test(levelId) || !Number.isInteger(version) || version < 1) return json({ error: 'Bad level or version' }, 400);
  if (!NICK_RE.test(nickname)) return json({ error: 'Nickname must be 2-16 letters, digits, space, _ or -' }, 400);
  const squashed = nickname.toLowerCase().replace(/[\s_-]/g, '');
  if (BLOCK.some((w) => squashed.includes(w))) return json({ error: 'Please choose another nickname' }, 400);
  if (!Number.isInteger(timeMs) || timeMs < 0 || timeMs > MAX_TIME_MS) return json({ error: 'Bad time' }, 400);

  const level = await loadLevel(env, request, levelId, version);
  if (!level) return json({ error: 'Unknown level version' }, 404);
  if (timeMs < minTimeMs(level)) return json({ error: 'That time is not possible on this level' }, 422);

  const now = Date.now();
  const hash = await ipHash(env, request);
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE ip_hash = ? AND created_at > ?').bind(hash, now - 60_000).first();
  if (n >= RATE_PER_MINUTE) return json({ error: 'Too many submissions, try again in a minute' }, 429);

  await env.DB.prepare('INSERT INTO scores (level_id, version, nickname, time_ms, created_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(levelId, version, nickname, timeMs, now, hash).run();

  // Rank among best-per-nickname times.
  const { better } = await env.DB.prepare(
    `SELECT COUNT(*) AS better FROM (SELECT nickname, MIN(time_ms) AS t FROM scores WHERE level_id = ? AND version = ? GROUP BY nickname)
     WHERE t < (SELECT MIN(time_ms) FROM scores WHERE level_id = ? AND version = ? AND nickname = ?)`
  ).bind(levelId, version, levelId, version, nickname).first();
  return json({ ok: true, nickname, rank: better + 1, scores: await top(env, levelId, version) }, 201);
}
