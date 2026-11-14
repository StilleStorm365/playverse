// Community portals: shared rules for the browser (form hints) and the Pages Function (enforcement).
// Anyone can add a portal (on an empty hub pad) or a multiplayer game for the duo Vibe Jam portal.
// Tommy's rules (13/11): live at once, with limits: https only, a daily cap per person,
// and a portal is hidden automatically after a few reports.
export const TITLE_MAX = 32;
export const URL_MAX = 300;
export const DAILY = { portal: 1, jam: 3 };        // new entries per person per 24 h
export const REPORTS_TO_HIDE = 3;                  // distinct reporters
export const PORTAL_DAYS = 30;                     // hub portals free their pad after this
export const NICK_RE = /^[A-Za-z0-9 _-]{2,16}$/;
// Small, conservative blocklist; matched with spaces/_/- removed.
export const BLOCK = ['fuck', 'shit', 'cunt', 'nigg', 'fag', 'nazi', 'hitler', 'rape', 'whore', 'slut', 'porn', 'admin', 'moderator', 'playverse'];

export const blocked = (s) => { const q = s.toLowerCase().replace(/[\s_-]/g, ''); return BLOCK.some((w) => q.includes(w)); };

/** Returns a normalised https URL string, or null. No credentials, no IP addresses, no localhost. */
export function cleanUrl(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (!s || s.length > URL_MAX) return null;
  let u;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  const h = u.hostname;
  if (!h.includes('.') || h.endsWith('.') || /^[\d.]+$/.test(h) || h.startsWith('[') || /(^|\.)localhost$/.test(h)) return null;
  const out = u.toString();
  return out.length <= URL_MAX ? out : null;
}

/**
 * Checks a submission {kind, pad, title, url, multiplayer, nickname}.
 * Returns { error } or { value } with cleaned fields. `padCount` is the number of pads in the hub.
 */
export function checkSubmission(body, { padCount = Infinity } = {}) {
  if (!body || typeof body !== 'object') return { error: 'Expected an object' };
  const kind = body.kind;
  if (kind !== 'portal' && kind !== 'jam') return { error: 'Unknown kind' };
  const title = typeof body.title === 'string' ? body.title.trim().replace(/\s+/g, ' ') : '';
  if (title.length < 2 || title.length > TITLE_MAX || /[\u0000-\u001f\u007f<>]/.test(title)) return { error: `Title must be 2-${TITLE_MAX} characters` };
  if (blocked(title)) return { error: 'Please choose another title' };
  const url = cleanUrl(body.url);
  if (!url) return { error: 'The link must be a public https:// address' };
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : '';
  if (!NICK_RE.test(nickname)) return { error: 'Name must be 2-16 letters, digits, space, _ or -' };
  if (blocked(nickname)) return { error: 'Please choose another name' };
  let pad = null;
  if (kind === 'portal') {
    if (!Number.isInteger(body.pad) || body.pad < 0 || body.pad >= padCount) return { error: 'Pick an empty pad in the hub' };
    pad = body.pad;
  }
  const multiplayer = kind === 'jam' ? true : body.multiplayer === true;
  return { value: { kind, pad, title, url, multiplayer, nickname } };
}

/**
 * Pick a jam game from the community list. Every client sorts the same way and uses the server's
 * random seed in [0, 1), so two players who step into the portal together land in the same game.
 * `multiplayerOnly` is what the duo portal needs; alone, any game on the list will do.
 *
 * Why alone goes through the list too (14/11): vibejam.com/portal/2026 no longer redirects anywhere.
 * It answers 200 with a page that only links to the jam's front page, and before that it sent
 * players to games that are no longer up. Our own list is checked and can be moderated, so it is
 * the better first choice; the webring stays as the fallback when the list is empty.
 */
export function pickJamGame(items, seed, multiplayerOnly = false) {
  const list = items.filter((p) => p.kind === 'jam' && (!multiplayerOnly || p.multiplayer)).sort((a, b) => a.id - b.id);
  if (!list.length || !(seed >= 0 && seed < 1)) return null;
  return list[Math.floor(seed * list.length)];
}

/** The duo portal: the same game for everyone who stepped in together. */
export const pickDuoGame = (items, seed) => pickJamGame(items, seed, true);

// ---- Link checks (the room Worker asks each linked page once a day) ----
/** Three days of silence in a row and the link is left out of the list. One bad day is not enough. */
export const FAILS_TO_DROP = 3;

/** What a check does to a row. `ok` is what the page answered; anything else counts as a failure. */
export function applyCheck({ fails = 0 } = {}, { ok, status = 0 }, now) {
  return { fails: ok ? 0 : fails + 1, last_status: status, checked_at: now };
}

/** A link we have stopped sending players to - shown to the owner, not deleted. */
export const isDeadLink = (row) => (row?.fails ?? 0) >= FAILS_TO_DROP;
