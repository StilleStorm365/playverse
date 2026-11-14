// Owner moderation page: lists every community portal and lets the owner hide, unhide or delete it.
// The token is kept in sessionStorage only (gone when the tab closes).
import { isDeadLink } from './community.js';
const $ = (id) => document.getElementById(id);
const KEY = 'playverse:admin';
let token = '';
try { token = sessionStorage.getItem(KEY) || ''; } catch { /* storage off */ }

async function call(method, body) {
  const r = await fetch('api/admin', {
    method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

function el(tag, text, cls) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }

let checks = new Map();   // id -> { ok, status, error } from the last link check

function render({ portals, now }) {
  $('list').hidden = false;
  const rows = portals.map((p) => {
    const tr = el('tr'); const expired = p.expiresAt <= now;
    if (p.hidden || expired) tr.className = 'off';
    const name = el('td'); name.append(el('div', p.title), el('div', p.url, 'url'));
    const kind = el('td', p.kind === 'portal' ? `portal · pad ${p.pad}` : 'multiplayer game');
    if (p.multiplayer && p.kind === 'portal') kind.append(el('div', 'multiplayer', 'url'));
    const by = el('td'); by.append(el('div', p.nickname), el('div', p.createdAt ? new Date(p.createdAt).toLocaleString() : 'built in', 'url'));
    const reports = el('td'); reports.append(el('span', String(p.reports), p.reports ? 'tag bad' : 'tag'));
    // The daily check (room Worker, 04:17 UTC) writes fails/checkedAt back; FAILS_TO_DROP in a row
    // and the link is left out of the list everyone sees.
    const dead = isDeadLink(p);
    const status = el('td', p.hidden ? 'hidden' : expired ? 'expired' : dead ? 'link dead' : 'live');
    if (p.checkedAt) {
      const when = new Date(p.checkedAt).toLocaleString();
      const said = p.lastStatus ? `answered ${p.lastStatus}` : 'no answer';
      status.append(el('div', p.fails ? `${said} · ${p.fails} in a row · checked ${when}` : `checked ${when}`, p.fails ? 'tag bad' : 'url'));
    }
    const c = checks.get(p.id);
    if (c) status.append(el('div', c.ok ? `link ok (${c.status})` : c.error || `link failed (${c.status})`, c.ok ? 'url' : 'tag bad'));
    const actions = el('td');
    const btn = (label, action, secondary = true) => {
      const b = el('button', label); if (secondary) b.className = 'secondary';
      b.onclick = async () => {
        if (action === 'delete' && !confirm(`Delete "${p.title}" for good?`)) return;
        try { render(await call('POST', { action, id: p.id })); $('status').textContent = ''; } catch (e) { $('status').textContent = e.message; }
      };
      return b;
    };
    actions.append(p.hidden ? btn('Unhide', 'unhide') : btn('Hide', 'hide', false), btn('Delete', 'delete'));
    tr.append(name, kind, by, reports, status, actions);
    return tr;
  });
  if (!rows.length) { const tr = el('tr'); const td = el('td', 'No community portals yet.'); td.colSpan = 6; tr.append(td); rows.push(tr); }
  $('list').tBodies[0].replaceChildren(...rows);
}

async function liveCount() {
  try {
    const r = await fetch('api/room?count=1');
    if (!r.ok) return;
    const { players, max } = await r.json();
    $('live').textContent = `${players} of ${max} in the plaza right now`;
  } catch { /* room unavailable */ }
}

async function load() {
  liveCount();
  try { render(await call('GET')); $('status').textContent = ''; $('login').hidden = true; $('check').hidden = false; }
  catch (e) { $('status').textContent = e.message === 'Not allowed' ? 'Wrong or missing token.' : e.message; $('login').hidden = false; }
}

$('check').onclick = async () => {
  $('check').disabled = true; $('check').textContent = 'Checking…';
  try {
    const r = await call('POST', { action: 'check' });
    checks = new Map(r.checks.map((c) => [c.id, c]));
    const bad = r.checks.filter((c) => !c.ok).length;
    $('status').textContent = bad ? `${bad} of ${r.checks.length} links did not answer.` : `All ${r.checks.length} links answered.`;
    render(await call('GET'));
  } catch (e) { $('status').textContent = e.message; }
  $('check').disabled = false; $('check').textContent = 'Check links';
};

$('login').onsubmit = (e) => {
  e.preventDefault();
  token = $('token').value.trim();
  try { sessionStorage.setItem(KEY, token); } catch { /* storage off */ }
  load();
};
if (token) load();
