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
