// Webring portals (Cursor Vibe Jam 2026 protocol, https://vibejam.com/2026#portals):
// - Exit: send the player to the redirector with ?portal=true and optional username, color, speed, ref.
//   The redirector picks a random jam game with a working portal.
// - Arrival: a game opened with ?portal=true drops the player straight in (no start screen); if ?ref= is
//   present it shows a return portal that sends them back to `ref` with the same parameters.
// All incoming parameters are untrusted. Pure functions here; hub.js wires them to the room.
import { NICK_RE } from './leaderboard.js';

export const RINGS = {
  'vibejam-2026': { name: 'Vibe Jam', url: 'https://vibejam.com/portal/2026', blurb: 'Jump to a random game from Cursor Vibe Jam 2026.' },
};
export const PLAYER_COLOR = 'f4f1ff';
export const PLAYER_SPEED = 5;   // tiles per second; the protocol says metres per second, close enough for 2D
const PASS = ['username', 'color', 'speed', 'avatar_url', 'team', 'hp', 'speed_x', 'speed_y', 'speed_z', 'rotation_x', 'rotation_y', 'rotation_z'];
const MAX_PARAM = 200;

/** Turns a `ref` value into a safe absolute http(s) URL, or null. Accepts a bare host ("fly.pieter.com"). */
export function safeRef(ref) {
  if (typeof ref !== 'string' || !ref || ref.length > 500) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(ref) ? ref : `https://${ref}`;
  let u;
  try { u = new URL(withScheme); } catch { return null; }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || !u.hostname || u.username || u.password) return null;
  return u;
}

/** Reads ?portal=true&ref=...&username=... Returns null when this is not a portal arrival. */
export function parseArrival(search) {
  const q = new URLSearchParams(search);
  const portal = q.get('portal');
  if (portal !== 'true' && portal !== '1') return null;
  const params = {};
  for (const k of PASS) {
    const v = q.get(k);
    if (v !== null && v.length <= MAX_PARAM) params[k] = v;
  }
  const ref = safeRef(q.get('ref'));
  const username = params.username?.trim();
  return { ref, params, nickname: username && NICK_RE.test(username) ? username : null };
}

function build(base, params) {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  return u.toString();
}

/** URL for walking into a webring exit portal. Carries over what the player arrived with. */
export function exitUrl(ringId, { selfUrl, nickname, arrival } = {}) {
  const ring = RINGS[ringId];
  if (!ring) return null;
  return build(ring.url, {
    ...(arrival?.params || {}),
    portal: 'true',
    username: nickname || arrival?.params.username,
    color: arrival?.params.color || PLAYER_COLOR,
    speed: PLAYER_SPEED,
    ref: selfUrl,
  });
}

/** URL for the return portal: back to `ref`, with the parameters the player came with, and us as the new ref. */
export function returnUrl(arrival, { selfUrl, nickname } = {}) {
  if (!arrival?.ref) return null;
  const params = { ...arrival.params, portal: 'true', ref: selfUrl };
  if (nickname) params.username = nickname;
  return build(arrival.ref.toString(), params);
}

/** URL for the duo portal: a multiplayer game from the community list, with the same portal parameters. */
export function gameUrl(url, { selfUrl, nickname, arrival } = {}) {
  return build(url, {
    portal: 'true',
    username: nickname || arrival?.params.username,
    color: arrival?.params.color || PLAYER_COLOR,
    speed: PLAYER_SPEED,
    ref: selfUrl,
  });
}
