#!/usr/bin/env node
// Checks a running Playverse: every page, asset and API route a player touches, plus the room.
// Usage: node tools/smoke.mjs [baseUrl]        (default http://127.0.0.1:8789)
//        npm run smoke -- https://playverse-2kf.pages.dev
// Read-only: it never creates a portal or a score. Exits non-zero on the first real failure.
const base = (process.argv[2] || 'http://127.0.0.1:8789').replace(/\/$/, '');
const origin = new URL(base).origin;
const results = [];
const ok = (name, detail = '') => results.push({ name, pass: true, detail });
const bad = (name, detail) => results.push({ name, pass: false, detail });

async function check(name, run) {
  try {
    const detail = await run();
    ok(name, detail || '');
  } catch (e) {
    bad(name, e.message);
  }
}

const get = async (path, init) => {
  const r = await fetch(base + path, { redirect: 'follow', ...init });
  return r;
};
function expect(cond, msg) { if (!cond) throw new Error(msg); }

await check('hub page', async () => {
  const r = await get('/');
  expect(r.ok, `status ${r.status}`);
  const html = await r.text();
  expect(html.includes('Nexus Plaza'), 'no "Nexus Plaza" in the page');
  expect(html.includes('manifest.webmanifest'), 'no manifest link');
  return `${r.status}, ${html.length} bytes`;
});

await check('published levels', async () => {
  const r = await get('/levels/published.json');
  expect(r.ok, `status ${r.status}`);
  const pub = await r.json();
  expect(Number.isInteger(pub.hub), 'no hub version');
  const hub = await (await get(`/levels/hub/v${pub.hub}.json`)).json();
  expect(hub.type === 'hub' && Array.isArray(hub.pads), 'hub level looks wrong');
  return `hub v${pub.hub}, ${hub.pads.length} pads, ${hub.portals.length} fixed portals`;
});

await check('assets', async () => {
  const want = { '/favicon.svg': 'image/svg', '/icon-512.png': 'image/png', '/og.png': 'image/png', '/manifest.webmanifest': 'json', '/robots.txt': 'text/plain', '/sitemap.xml': 'xml' };
  for (const [path, type] of Object.entries(want)) {
    const r = await get(path);
    expect(r.ok, `${path} -> ${r.status}`);
    expect((r.headers.get('content-type') || '').includes(type), `${path} is ${r.headers.get('content-type')}, expected ${type}`);
  }
  return `${Object.keys(want).length} files`;
});

await check('security headers', async () => {
  const r = await get('/');
  const csp = r.headers.get('content-security-policy') || '';
  expect(csp.includes("script-src 'self'"), `no script-src 'self' (got "${csp.slice(0, 60)}")`);
  expect(csp.includes("frame-ancestors 'none'"), 'no frame-ancestors');
  expect(r.headers.get('x-content-type-options') === 'nosniff', 'no nosniff');
  expect((r.headers.get('referrer-policy') || '').length > 0, 'no referrer policy');
  return 'policy, nosniff and referrer policy present';
});

await check('community portals API', async () => {
  const r = await get('/api/portals');
  expect(r.ok, `status ${r.status}`);
  const { portals } = await r.json();
  expect(Array.isArray(portals), 'no portals array');
  const games = portals.filter((p) => p.multiplayer);
  expect(games.length > 0, 'the duo list is empty: two players would be sent to Vibe Jam at random');
  for (const p of portals) expect(p.url.startsWith('https://'), `${p.title} is not https`);
  return `${portals.length} entries, ${games.length} multiplayer`;
});

await check('leaderboard API', async () => {
  const r = await get('/api/scores?levelId=first-steps&version=1');
  expect(r.ok, `status ${r.status}`);
  const d = await r.json();
  expect(Array.isArray(d.scores), 'no scores array');
  return `${d.scores.length} scores`;
});

await check('leaderboard rejects a forged run', async () => {
  const r = await get('/api/scores', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ levelId: 'first-steps', version: 1, nickname: 'SmokeTest', replay: { v: 1, runs: [[600, 16, 0]] } }),
  });
  expect(r.status === 422, `expected 422, got ${r.status}`);
  return 'walking right does not reach the goal: 422';
});

await check('admin needs the token', async () => {
  const r = await get('/api/admin');
  expect(r.status === 401, `expected 401, got ${r.status}`);
  return '401 without a token';
});

await check('room count', async () => {
  const r = await get('/api/room?count=1');
  expect(r.ok, `status ${r.status}`);
  const d = await r.json();
  expect(Number.isInteger(d.players) && Number.isInteger(d.max), 'no player count');
  return `${d.players} of ${d.max} in the plaza`;
});

await check('room refuses a foreign page', async () => {
  const r = await get('/api/room?count=1', { headers: { Origin: 'https://evil.example' } });
  expect(r.status === 403, `expected 403, got ${r.status}`);
  return '403 for another origin';
});

await check('room welcomes a player', async () => {
  const url = base.replace(/^http/, 'ws') + '/api/room';
  const ws = new WebSocket(url, { headers: { Origin: origin } });
  const msg = await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('no welcome within 8 s')), 8000);
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hi', nick: 'SmokeTest', x: 12.5, y: 9.5 }));
    ws.onmessage = (e) => { clearTimeout(timer); res(JSON.parse(e.data)); };
    ws.onerror = () => { clearTimeout(timer); rej(new Error('could not connect')); };
    ws.onclose = (e) => { clearTimeout(timer); rej(new Error(e.code === 4001 ? 'the plaza is full' : `closed with ${e.code}`)); };
  });
  ws.close();
  expect(msg.t === 'welcome' && typeof msg.id === 'string', `first message was ${msg.t}`);
  return `welcome, ${msg.players.length} other player(s)`;
});

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? 'ok  ' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} checks passed against ${base}`);
process.exit(failed.length ? 1 : 0);
