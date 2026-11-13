// Pure rules for the hub room: no Durable Object, no network, so Node tests can cover them.
// index.js holds the sockets and storage and calls into this.
import { NICK_RE, blocked } from '../../public/js/community.js';

export const MAX_PLAYERS = 40;
export const PARTY_MS = 4000;      // the duo window, from the first player entering the portal
export const MAX_MSG = 300;        // bytes per client message
export const MSG_PER_SEC = 25;
export const EMOTES = 4;
export const EMOTE_GAP_MS = 1000;
export const MAX_COORD = 64;       // tiles; the biggest level is far smaller
export const CLOSE_FULL = 4001;    // close code the client shows as "the plaza is full"
export const CLOSE_IDLE = 4002;    // dropped as a ghost: nothing heard for IDLE_MS
export const IDLE_MS = 12 * 60 * 1000;   // the client pings every 4 min while its tab is visible
export const SWEEP_MS = 5 * 60 * 1000;   // how often we look for ghosts
export const SNAPSHOT_MS = 100;    // positions go out as one snapshot at most this often

/** A coordinate we are willing to relay: finite, inside the world, 2 decimals. */
export const clampCoord = (v) => (Number.isFinite(v) ? Math.round(Math.max(0, Math.min(MAX_COORD, v)) * 100) / 100 : 0);

/** A nickname we are willing to show other players, or "guest". */
export function cleanNick(n) {
  const s = typeof n === 'string' ? n.trim() : '';
  return NICK_RE.test(s) && !blocked(s) ? s : 'guest';
}

/** What other players get to know about someone. */
export const publicPlayer = (a) => ({ id: a.id, nick: a.nick, x: a.x, y: a.y });

/** Per-connection rate limit: a fresh counter every second. Mutates and returns the attachment. */
export function countMessage(a, now) {
  if (now - (a.win || 0) > 1000) { a.win = now; a.n = 0; }
  a.n = (a.n || 0) + 1;
  return a.n <= MSG_PER_SEC;
}

export const validEmote = (e) => Number.isInteger(e) && e >= 0 && e < EMOTES;

/** Adds `id` to the duo queue, opening a new window if none is running. Returns the new queue. */
export function partyJoin(party, id, now) {
  const open = party && party.endsAt > now ? { ...party, ids: [...party.ids] } : { ids: [], endsAt: now + PARTY_MS };
  if (!open.ids.includes(id)) open.ids.push(id);
  return open;
}

/** Removes `id`. Returns the new queue, or null when nobody is left waiting. */
export function partyLeave(party, id) {
  if (!party || !party.ids.includes(id)) return party ?? null;
  const ids = party.ids.filter((x) => x !== id);
  return ids.length ? { ...party, ids } : null;
}

/**
 * When the window closes: what each waiting player is told.
 * `members` are the connected players still in the queue, in [{id, nick}] form.
 * 2+ players travel together ("duo") with one shared seed, so every client picks the same game.
 */
export function goMessages(members, seed) {
  const mode = members.length >= 2 ? 'duo' : 'solo';
  return members.map((m) => ({
    id: m.id,
    msg: { t: 'go', mode, seed, with: members.filter((o) => o.id !== m.id).map((o) => o.nick) },
  }));
}

/** A connection we have heard nothing from for too long: a closed laptop, a crashed tab. */
export const isIdle = (a, now) => now - (a?.seen ?? 0) > IDLE_MS;

/**
 * When the room should wake up next: the duo window if one is running, otherwise a sweep while
 * anyone is connected. Returns a timestamp, or null when the room can sleep for good.
 */
export function nextAlarm(party, connections, now) {
  // A window that has already run out is handled at once: anyone standing in the portal is
  // waiting on it, and making them wait for the next sweep would look like the portal is broken.
  if (party && party.endsAt <= now) return now;
  const due = [];
  if (party) due.push(party.endsAt);
  if (connections > 0) due.push(now + SWEEP_MS);
  return due.length ? Math.min(...due) : null;
}

/**
 * Positions are not relayed one by one. Sending every player's every step to every other player is
 * work proportional to the square of the crowd: measured on 2026-11-13, 30 players walking produced
 * over 6000 messages a second and round trips above four seconds. Instead the room collects the
 * positions that changed and sends one snapshot per client, at most every SNAPSHOT_MS.
 *
 * `pending` is a Map of id -> {x, y}. Returns [[id, x, y], ...], or null when there is nothing to say.
 */
export function snapshot(pending) {
  if (!pending?.size) return null;
  return [...pending].map(([id, p]) => [id, p.x, p.y]);
}

/** Whether a snapshot may go out now, or has to wait (and for how long). */
export function flushIn(lastFlush, now) {
  const due = lastFlush + SNAPSHOT_MS - now;
  return due > 0 ? due : 0;
}
