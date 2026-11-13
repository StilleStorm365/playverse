// Owner moderation page: lists every community portal and lets the owner hide, unhide or delete it.
// The token is kept in sessionStorage only (gone when the tab closes).
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
    const status = el('td', p.hidden ? 'hidden' : expired ? 'expired' : 'live');
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

async function load() {
  try { render(await call('GET')); $('status').textContent = ''; $('login').hidden = true; }
  catch (e) { $('status').textContent = e.message === 'Not allowed' ? 'Wrong or missing token.' : e.message; $('login').hidden = false; }
}

$('login').onsubmit = (e) => {
  e.preventDefault();
  token = $('token').value.trim();
  try { sessionStorage.setItem(KEY, token); } catch { /* storage off */ }
  load();
};
if (token) load();
