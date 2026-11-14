// Cloudflare Pages Function: /api/portals
// GET  -> { portals: [{ id, kind, pad, title, url, multiplayer, nickname }] }  (visible, not expired)
// POST { action: "create", kind, pad?, title, url, multiplayer, nickname, token }
//      { action: "report", id }
//      { action: "remove", id, token }   (only the creator: token is kept in their browser)
// No login. Limits (Tommy 13/11): https only, DAILY per person (salted IP hash or creator token),
// hidden after REPORTS_TO_HIDE distinct reporters, hub portals expire after PORTAL_DAYS.
import { checkSubmission, DAILY, REPORTS_TO_HIDE, PORTAL_DAYS, FAILS_TO_DROP } from '../../public/js/community.js';
import { json, ipHash, sha256, readJson, loadPublishedHub } from '../../lib/server.js';

const DAY = 24 * 3600 * 1000;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const REPORTS_PER_DAY = 20;

// Links that have been silent FAILS_TO_DROP checks in a row are left out: both the duo portal and
// a lone player are sent to a game from this list, so a game that has disappeared would send
// everyone to a dead page. Nothing is deleted - the owner still sees them on /admin.html.
const list = async (env, now) => (await env.DB.prepare(
  `SELECT id, kind, pad, title, url, multiplayer, nickname FROM portals
   WHERE hidden = 0 AND expires_at > ? AND fails < ? ORDER BY id`,
).bind(now, FAILS_TO_DROP).all()).results.map((r) => ({ ...r, multiplayer: !!r.multiplayer }));

export async function onRequestGet({ env }) {
  return json({ portals: await list(env, Date.now()) });
}

export async function onRequestPost({ request, env }) {
  const { body, error } = await readJson(request, 2048);
  if (error) return error;
  const now = Date.now();
  const ip = await ipHash(env, request);
  if (body?.action === 'create') return create(env, request, body, ip, now);
  if (body?.action === 'report') return report(env, body, ip, now);
  if (body?.action === 'remove') return remove(env, body, now);
  return json({ error: 'Unknown action' }, 400);
}

async function create(env, request, body, ip, now) {
  if (typeof body.token !== 'string' || !TOKEN_RE.test(body.token)) return json({ error: 'Missing token' }, 400);
  let padCount = 0;
  if (body.kind === 'portal') {
    const hub = await loadPublishedHub(env, request);
    padCount = hub?.pads?.length ?? 0;
  }
  const { value: v, error } = checkSubmission(body, { padCount });
  if (error) return json({ error }, 400);
  const owner = await sha256(body.token);

  const { n } = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM portals WHERE kind = ? AND (ip_hash = ? OR owner_hash = ?) AND created_at > ?',
  ).bind(v.kind, ip, owner, now - DAY).first();
  if (n >= DAILY[v.kind]) {
    return json({ error: v.kind === 'portal' ? 'You can build one portal a day. Try again tomorrow.' : 'You can add 3 games a day. Try again tomorrow.' }, 429);
  }
  const dup = await env.DB.prepare('SELECT 1 AS d FROM portals WHERE url = ? AND kind = ? AND hidden = 0 AND expires_at > ?').bind(v.url, v.kind, now).first();
  if (dup) return json({ error: v.kind === 'jam' ? 'That game is already on the list' : 'That link already has a portal' }, 409);

  // Expired hub portals free their pad.
  await env.DB.prepare("DELETE FROM portals WHERE kind = 'portal' AND expires_at <= ?").bind(now).run();
  const expires = v.kind === 'portal' ? now + PORTAL_DAYS * DAY : 253402300799000;
  try {
    const row = await env.DB.prepare(
      `INSERT INTO portals (kind, pad, title, url, multiplayer, nickname, ip_hash, owner_hash, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    ).bind(v.kind, v.pad, v.title, v.url, v.multiplayer ? 1 : 0, v.nickname, ip, owner, now, expires).first();
    return json({ ok: true, id: row.id, portals: await list(env, now) }, 201);
  } catch (e) {
    if (/UNIQUE/i.test(String(e?.message))) return json({ error: 'Someone just built on that pad. Pick another one.' }, 409);
    throw e;
  }
}

async function report(env, body, ip, now) {
  if (!Number.isInteger(body.id) || body.id < 1) return json({ error: 'Bad id' }, 400);
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM reports WHERE ip_hash = ? AND created_at > ?').bind(ip, now - DAY).first();
  if (n >= REPORTS_PER_DAY) return json({ error: 'Too many reports today' }, 429);
  const exists = await env.DB.prepare('SELECT 1 AS e FROM portals WHERE id = ? AND hidden = 0').bind(body.id).first();
  if (!exists) return json({ ok: true, hidden: true });
  await env.DB.prepare('INSERT OR IGNORE INTO reports (portal_id, ip_hash, created_at) VALUES (?, ?, ?)').bind(body.id, ip, now).run();
  const { c } = await env.DB.prepare('SELECT COUNT(*) AS c FROM reports WHERE portal_id = ?').bind(body.id).first();
  const hidden = c >= REPORTS_TO_HIDE;
  if (hidden) await env.DB.prepare('UPDATE portals SET hidden = 1 WHERE id = ?').bind(body.id).run();
  return json({ ok: true, hidden });
}

async function remove(env, body, now) {
  if (!Number.isInteger(body.id) || typeof body.token !== 'string' || !TOKEN_RE.test(body.token)) return json({ error: 'Bad request' }, 400);
  const res = await env.DB.prepare('DELETE FROM portals WHERE id = ? AND owner_hash = ?').bind(body.id, await sha256(body.token)).run();
  if (!res.meta.changes) return json({ error: 'Only the person who built it can remove it' }, 403);
  return json({ ok: true, portals: await list(env, now) });
}
