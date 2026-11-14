// Once a day the Worker asks every linked page whether it is still there.
//
// Why here: both the duo portal and a lone player are sent to a game from the community list
// (14/11), so a game that has quietly disappeared would send every player to a dead page. This is
// the only real Worker in the project, and Pages Functions cannot be given a cron trigger.
//
// A link is not dropped the first time it is silent - a game can be down for an hour. After
// FAILS_TO_DROP checks in a row with no good answer it is left out of the list; one good answer
// puts it straight back. Nothing is deleted, and the owner sees the state on /admin.html.
import { applyCheck } from '../../public/js/community.js';

const TIMEOUT_MS = 8000;
const BATCH = 40;          // the whole list today is nine rows; this is just a ceiling

/** Asks one page. Any answer at all that is not an error status counts as alive. */
async function ask(url, fetchImpl) {
  try {
    const r = await fetchImpl(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { ok: r.ok, status: r.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** Checks every visible link and writes the result back. Returns a short summary for the log. */
export async function runLinkCheck(env, now = Date.now(), fetchImpl = fetch) {
  const { results } = await env.DB.prepare(
    'SELECT id, url, fails FROM portals WHERE hidden = 0 AND expires_at > ? ORDER BY id LIMIT ?',
  ).bind(now, BATCH).all();
  if (!results.length) return { checked: 0, failed: 0, dropped: [] };

  const rows = await Promise.all(results.map(async (row) => [row, applyCheck(row, await ask(row.url, fetchImpl), now)]));
  await env.DB.batch(rows.map(([row, next]) => env.DB
    .prepare('UPDATE portals SET fails = ?, last_status = ?, checked_at = ? WHERE id = ?')
    .bind(next.fails, next.last_status, next.checked_at, row.id)));

  const failed = rows.filter(([, next]) => next.fails > 0);
  return {
    checked: rows.length,
    failed: failed.length,
    dropped: failed.filter(([row]) => row.fails + 1 === 3).map(([row]) => row.url),
  };
}
