// Cloudflare Pages Function: /api/admin – moderation for community portals (owner only).
// Auth: "Authorization: Bearer <ADMIN_TOKEN>". ADMIN_TOKEN is a Pages secret; the owner keeps a copy
// locally in .env.admin (git-ignored). Without the secret the endpoint is off.
// GET  -> { portals: [...all, including hidden and expired, with report counts], now }
// POST { action: "hide" | "unhide" | "delete", id }
import { json, sha256, readJson } from '../../lib/server.js';

async function authorised(request, env) {
  if (!env.ADMIN_TOKEN) return false;
  const m = /^Bearer (.{16,200})$/.exec(request.headers.get('authorization') || '');
  if (!m) return false;
  // Compare hashes, so the comparison time does not depend on the secret.
  return (await sha256(m[1])) === (await sha256(env.ADMIN_TOKEN));
}

const all = async (env) => (await env.DB.prepare(
  `SELECT p.id, p.kind, p.pad, p.title, p.url, p.multiplayer, p.nickname, p.created_at AS createdAt, p.expires_at AS expiresAt,
          p.hidden, (SELECT COUNT(*) FROM reports r WHERE r.portal_id = p.id) AS reports
   FROM portals p ORDER BY p.id DESC LIMIT 300`,
).all()).results;

export async function onRequestGet({ request, env }) {
  if (!(await authorised(request, env))) return json({ error: 'Not allowed' }, 401);
  return json({ portals: await all(env), now: Date.now() });
}

export async function onRequestPost({ request, env }) {
  if (!(await authorised(request, env))) return json({ error: 'Not allowed' }, 401);
  const { body, error } = await readJson(request, 512);
  if (error) return error;
  const id = body?.id;
  if (!Number.isInteger(id) || id < 1) return json({ error: 'Bad id' }, 400);
  if (body.action === 'hide') await env.DB.prepare('UPDATE portals SET hidden = 1 WHERE id = ?').bind(id).run();
  else if (body.action === 'unhide') {
    try {
      await env.DB.batch([
        env.DB.prepare('UPDATE portals SET hidden = 0 WHERE id = ?').bind(id),
        env.DB.prepare('DELETE FROM reports WHERE portal_id = ?').bind(id),
      ]);
    } catch (e) {
      if (/UNIQUE/i.test(String(e?.message))) return json({ error: 'Another portal now stands on that pad' }, 409);
      throw e;
    }
  } else if (body.action === 'delete') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM portals WHERE id = ?').bind(id),
      env.DB.prepare('DELETE FROM reports WHERE portal_id = ?').bind(id),
    ]);
  } else return json({ error: 'Unknown action' }, 400);
  return json({ ok: true, portals: await all(env), now: Date.now() });
}
