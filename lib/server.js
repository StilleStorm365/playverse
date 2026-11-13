// Helpers shared by the Pages Functions (kept outside functions/ so they do not become routes).
import { validateLevel } from '../public/js/level.js';

export const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

/** Salted hash of the client IP (IP_SALT is a Pages secret; never stored in the repo). */
export async function ipHash(env, request) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  return sha256(`${env.IP_SALT || 'dev-salt'}:${ip}`);
}

/** Reads a JSON body of at most `max` bytes. Returns { body } or { error: Response }. */
export async function readJson(request, max) {
  if ((request.headers.get('content-type') || '').split(';')[0] !== 'application/json') return { error: json({ error: 'Expected JSON' }, 415) };
  const raw = await request.text();
  if (raw.length > max) return { error: json({ error: 'Too large' }, 413) };
  try { return { body: JSON.parse(raw) }; } catch { return { error: json({ error: 'Invalid JSON' }, 400) }; }
}

/** The published hub level (validated), or null. */
export async function loadPublishedHub(env, request) {
  try {
    const pub = await (await env.ASSETS.fetch(new URL('/levels/published.json', request.url))).json();
    const text = await (await env.ASSETS.fetch(new URL(`/levels/hub/v${pub.hub}.json`, request.url))).text();
    const hub = JSON.parse(text);
    return validateLevel(hub).ok && hub.type === 'hub' ? hub : null;
  } catch { return null; }
}
