// The hub, Nexus Plaza: a walkable room shared with everyone online.
// - Other players are drawn live (presence.js -> /api/room, a Durable Object).
// - Fixed portals come from the hub level file (webring exits, or race levels).
// - Community portals sit on pads; anyone can build one on an empty pad (/api/portals).
// - The Vibe Jam portal waits a few seconds after the first player enters: if 2+ players went in,
//   they all go to the same random multiplayer game from the community list, else to Vibe Jam's own random pick.
import { createGame, step, STEP } from './engine.js';
import { fitView, camera, draw } from './render.js';
import { createInput } from './input.js';
import { loadPublished, loadLevel } from './levels.js';
import { getBest, getNickname, setNickname, getOwnerToken, getMine, addMine, getSeenWelcome, setSeenWelcome } from './store.js';
import { fetchTop } from './leaderboard.js';
import { RINGS, parseArrival, exitUrl, returnUrl, gameUrl } from './webring.js';
import { NICK_RE, blocked, cleanUrl, pickJamGame, DAILY, PORTAL_DAYS, REPORTS_TO_HIDE } from './community.js';
import { connectPresence, plazaStatus } from './presence.js';

const $ = (id) => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d'), stage = $('stage');
const fmt = (ms) => (ms / 1000).toFixed(2);
const hostOf = (url) => { try { return new URL(url).hostname; } catch { return url; } };
const EMOTES = ['👋', '❤️', '😂', '🎉'];
const peerColor = (id) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 80% 72%)`; };

function showError(msg) { $('error-text').textContent = msg; $('error').hidden = false; $('hint').hidden = true; }

async function api(body) {
  const r = await fetch('api/portals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}

async function main() {
  let pub, hub;
  try {
    pub = await loadPublished();
    if (!pub.hub) throw new Error('No hub is published');
    ({ level: hub } = await loadLevel('hub', pub.hub));
    if (hub.type !== 'hub') throw new Error('The hub level is not a hub');
  } catch (e) { return showError(e.message); }

  // Published race levels: needed for level portals (if the hub has any) and for Browse all.
  // Everything else can start without them, so they are fetched on demand.
  const levels = new Map();
  let levelsLoaded = null;
  function loadLevels() {
    levelsLoaded ??= Promise.all(Object.entries(pub).filter(([id]) => id !== 'hub').map(async ([id, v]) => {
      try { const { level, info } = await loadLevel(id, v); if (level.type === 'race') levels.set(id, { level, info }); } catch { /* skip broken */ }
    }));
    return levelsLoaded;
  }
  const hasLevelPortals = hub.portals.some((p) => p.levelId);
  if (hasLevelPortals) await loadLevels();
  const fixed = hub.portals.filter((p) => (p.webring ? RINGS[p.webring] : levels.has(p.levelId)));
  const pads = hub.pads || [];

  // Arriving through a webring portal (?portal=true): no start screen, and a return portal next to the start.
  const selfUrl = location.origin + location.pathname;
  const arrival = parseArrival(location.search);
  if (arrival) {
    if (arrival.nickname && !getNickname()) setNickname(arrival.nickname);
    const s = hub.tiles.flatMap((row, y) => [...row].map((c, x) => (c === 'S' ? { x, y } : null))).find(Boolean);
    const taken = (q) => fixed.some((p) => p.x === q.x && p.y === q.y) || pads.some((p) => p.x === q.x && p.y === q.y);
    const spot = arrival.ref && [[-1, 0], [1, 0], [0, 1], [0, -1]]
      .map(([dx, dy]) => ({ x: s.x + dx, y: s.y + dy }))
      .find((q) => hub.tiles[q.y]?.[q.x] === '.' && !taken(q));
    if (spot) fixed.push({ ...spot, returnTo: true });
    history.replaceState(null, '', location.pathname);
  }

  // Community entries: hub portals (on pads) and multiplayer games for the duo portal.
  let items = [];
  const hubLevel = { ...hub, portals: [...fixed] };
  const padAt = (x, y) => pads.findIndex((p) => p.x === x && p.y === y);
  function setItems(list) {
    items = Array.isArray(list) ? list : [];
    const onPads = items.filter((it) => it.kind === 'portal' && it.pad < pads.length)
      .map((it) => ({ x: pads[it.pad].x, y: pads[it.pad].y, community: it }));
    hubLevel.portals = [...fixed, ...onPads];
    lastKey = null;   // re-evaluate the plaque
  }
  async function refreshItems() {
    try { const r = await fetch('api/portals'); if (r.ok) setItems((await r.json()).portals); } catch { /* offline: keep what we have */ }
  }
  const emptyPads = () => pads.filter((p) => !hubLevel.portals.some((q) => q.x === p.x && q.y === p.y));

  const g = createGame(hubLevel);
  const input = createInput(stage);
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch) {
    $('hint').textContent = 'Drag to walk · tap the card to enter · stand on a + to build';
    $('w-walk').innerHTML = '<b>Walk</b> by dragging anywhere on the square.';
  }
  let scale, view, acc = 0, last = performance.now(), current = null, lastKey = null;
  let party = { ids: [], endsAt: 0 }, leaving = false;
  const tops = new Map();

  // Presence
  const presence = connectPresence({
    nick: () => getNickname() || 'guest', pos: () => ({ x: g.x, y: g.y }),
    onEvent(m) {
      if (m.t === 'party') { party = { ids: m.ids || [], endsAt: m.endsAt || 0 }; lastKey = null; }
      else if (m.t === 'go') go(m);
      else if (m.t === 'portals') refreshItems();
      else if (m.t === 'offline') { party = { ids: [], endsAt: 0 }; lastKey = null; }
      else if (m.t === 'full') toast('Nexus Plaza is full right now - trying again in a moment');
      updateOnline();
    },
  });
  const inParty = () => presence.online && party.ids.includes(presence.id);
  // The bar always says where we stand: the count, or that we cannot reach the plaza. Without this
  // a player whose connection is blocked just sees an empty plaza and no reason why (measured 14/11).
  function updateOnline() {
    const s = plazaStatus(presence.state, presence.peers.size + 1);
    $('online').textContent = s.count;
    $('conn').textContent = s.conn;
    $('conn').title = s.conn && presence.state === 'offline'
      ? "Playverse cannot reach the plaza. You can still walk and enter portals, but you will not see other players."
      : '';
  }
  updateOnline();

  // Name field
  $('nick').value = getNickname();
  $('nick').onchange = () => {
    const v = $('nick').value.trim();
    const ok = NICK_RE.test(v) && !blocked(v);
    $('nick').setAttribute('aria-invalid', String(!ok && v !== ''));
    if (!ok) return;
    setNickname(v); presence.send({ t: 'nick', nick: v });
  };

  // Both alone and together we send the player to a game from the community list; the webring is
  // only the fallback when the list is empty. Together, the server's seed makes it the same game.
  function go(m) {
    const nickname = getNickname() || undefined;
    const game = pickJamGame(items, m.seed, m.mode === 'duo');
    const url = game ? gameUrl(game.url, { selfUrl, nickname, arrival }) : null;
    leaving = true;
    location.href = url || exitUrl('vibejam-2026', { selfUrl, nickname, arrival });
  }

  const secsLeft = () => Math.max(0, Math.ceil((party.endsAt - Date.now()) / 1000));
  const labels = (p) => {
    if (p.returnTo) return `← ${arrival.ref.hostname}`;
    if (p.community) return p.community.title;
    if (p.webring) return party.ids.length ? `${RINGS[p.webring].name} ↗ · ${party.ids.length} going in ${secsLeft()}s` : `${RINGS[p.webring].name} ↗`;
    return levels.get(p.levelId)?.level.title;
  };
  const portalDone = (p) => { const l = levels.get(p.levelId)?.level; return l && getBest(l.id, l.version); };

  function resize() { view = fitView(canvas, hubLevel, { width: stage.clientWidth - 16, height: stage.clientHeight - 48 }); scale = view.s; }
  const overlayOpen = () => !$('browse').hidden || !$('build').hidden || !$('welcome').hidden;

  // ---- Plaques ----
  function plaque({ title, meta = '', best = '', top = '', enter, alt, report, remove }) {
    $('p-title').textContent = title; $('p-meta').textContent = meta; $('p-best').textContent = best; $('p-top').textContent = top;
    $('p-enter').textContent = enter.label; $('p-enter').disabled = !!enter.disabled;
    $('p-alt').hidden = !alt; if (alt) $('p-alt').textContent = alt;
    $('p-report').hidden = !report;
    $('p-remove').hidden = !remove;
    $('plaque').hidden = false;
  }
  function showPlaque(spot) {
    const same = current?.key === spot?.key;
    current = spot;
    if (!same) { $('p-report').disabled = false; $('p-report').textContent = 'Report'; }
    if (!spot) { $('plaque').hidden = true; return; }
    if (spot.pad !== undefined) {
      return plaque({ title: 'Empty pad', meta: 'Build a portal to your own game or app here. Everyone sees it right away.', enter: { label: 'Build here (Enter)' } });
    }
    const p = spot.portal;
    if (p.community) {
      const c = p.community;
      return plaque({
        title: c.title, meta: `by ${c.nickname}${c.multiplayer ? ' · multiplayer' : ''}`,
        best: `You leave Playverse for ${hostOf(c.url)}.`, top: 'Built by a player: Playverse has not checked it.',
        enter: { label: 'Go (Enter)' }, report: true, remove: getMine().includes(c.id),
      });
    }
    if (p.returnTo) {
      return plaque({ title: `Back to ${arrival.ref.hostname}`, meta: 'Return to the game you came from.', best: `You leave Playverse for ${arrival.ref.hostname}.`, enter: { label: 'Go (Enter)' } });
    }
    if (p.webring) {
      const ring = RINGS[p.webring], n = party.ids.length;
      const duoGames = items.filter((it) => it.multiplayer).length;
      return plaque({
        title: `${ring.name} webring`,
        meta: presence.online
          ? `Alone: a random game from the list. Together: step in within a few seconds of each other and you all go to the same multiplayer game (${duoGames} on the list).`
          : `${ring.blurb} Playverse cannot reach the plaza right now, so you go in alone.`,
        best: inParty() ? `Leaving in ${secsLeft()}s · ${n} ${n === 1 ? 'player' : 'players'} in the portal (Esc to cancel)`
          : n ? `${n} going in ${secsLeft()}s. Press Enter to join them!` : `You leave Playverse for ${hostOf(ring.url)}.`,
        enter: { label: inParty() ? 'Waiting…' : n ? 'Join (Enter)' : 'Go (Enter)', disabled: inParty() },
        alt: 'Add a multiplayer game',
      });
    }
    const lv = levels.get(p.levelId);
    if (!lv) { $('plaque').hidden = true; return; }
    const { level, info } = lv;
    const best = getBest(level.id, level.version);
    const t = tops.get(level.id);
    plaque({
      title: level.title, meta: `by ${level.author} · v${level.version} · ${info.stars} ★`,
      best: best ? `Your best: ${fmt(best.timeMs)} s` : 'Not played yet',
      top: t ? `Record: ${fmt(t.timeMs)} s by ${t.nickname}` : t === null ? 'No record yet' : '',
      enter: { label: 'Play (Enter)' },
    });
    if (!tops.has(level.id)) {
      tops.set(level.id, undefined);
      fetchTop(level.id, level.version).then((d) => { tops.set(level.id, d.scores[0] || null); lastKey = null; }).catch(() => {});
    }
  }

  function enter() {
    if (!current || overlayOpen() || leaving) return;
    if (current.pad !== undefined) return openBuild('portal', current.pad);
    const p = current.portal, nickname = getNickname() || undefined;
    if (p.community) { leaving = true; location.href = p.community.url; return; }
    if (p.returnTo) { leaving = true; location.href = returnUrl(arrival, { selfUrl, nickname }); return; }
    if (p.webring) {
      if (!presence.online) { go({ mode: 'solo', seed: Math.random() }); return; }
      if (!inParty()) presence.send({ t: 'jam' });
      return;
    }
    location.href = `play.html#/w/${p.levelId}@${pub[p.levelId]}`;
  }
  let unjamAt = 0;
  function cancelWait() { if (inParty() && Date.now() - unjamAt > 500) { unjamAt = Date.now(); presence.send({ t: 'unjam' }); } }

  $('p-enter').onclick = enter;
  $('p-alt').onclick = () => openBuild('jam');
  $('p-report').onclick = async () => {
    const c = current?.portal?.community;
    if (!c || !confirm(`Report "${c.title}" as broken, spam or harmful? It is hidden after ${REPORTS_TO_HIDE} reports.`)) return;
    $('p-report').disabled = true;
    try { const r = await api({ action: 'report', id: c.id }); $('p-report').textContent = 'Reported'; if (r.hidden) { await refreshItems(); presence.send({ t: 'portals' }); } }
    catch (e) { $('p-report').textContent = e.message; }
  };
  $('p-remove').onclick = async () => {
    const c = current?.portal?.community;
    if (!c || !confirm(`Remove your portal "${c.title}"?`)) return;
    try { const r = await api({ action: 'remove', id: c.id, token: getOwnerToken() }); setItems(r.portals); presence.send({ t: 'portals' }); }
    catch (e) { alert(e.message); }
  };

  // ---- Build dialog ----
  let buildKind = 'portal', buildPad = null;
  function openBuild(kind, pad = null) {
    buildKind = kind; buildPad = pad;
    input.reset();
    $('build-title').textContent = kind === 'jam' ? 'Add a multiplayer game' : 'Build a portal';
    $('build-intro').textContent = kind === 'jam'
      ? 'A game where two people who open the same link end up playing together. When friends enter the Vibe Jam portal together, they go to a random game from this list.'
      : 'Link your game, app or page. The portal appears on this pad for everyone right away.';
    $('build-rules').textContent = kind === 'jam'
      ? `Public https:// links only · ${DAILY.jam} games a day · players can report bad links.`
      : `Public https:// links only · ${DAILY.portal} portal a day · it stays ${PORTAL_DAYS} days · it is hidden after ${REPORTS_TO_HIDE} reports.`;
    $('b-mp-row').hidden = kind === 'jam';
    $('b-nick').value = getNickname(); $('b-title').value = ''; $('b-url').value = ''; $('b-mp').checked = false;
    $('b-status').textContent = ''; $('b-status').className = 'status'; $('b-submit').disabled = false;
    $('build').hidden = false;
    (getNickname() ? $('b-title') : $('b-nick')).focus();
  }
  function closeBuild() { $('build').hidden = true; input.reset(); lastKey = null; }
  $('b-cancel').onclick = closeBuild;
  $('build-form').onsubmit = async (e) => {
    e.preventDefault();
    const nickname = $('b-nick').value.trim(), url = cleanUrl($('b-url').value);
    const status = (t) => { $('b-status').textContent = t; };
    if (!NICK_RE.test(nickname)) return status('Name: 2–16 letters, digits, space, _ or -');
    if (!url) return status('The link must be a public https:// address');
    $('b-submit').disabled = true; status('');
    try {
      const r = await api({ action: 'create', kind: buildKind, pad: buildPad ?? undefined, title: $('b-title').value, url, multiplayer: $('b-mp').checked, nickname, token: getOwnerToken() });
      setNickname(nickname); $('nick').value = nickname; presence.send({ t: 'nick', nick: nickname });
      addMine(r.id); setItems(r.portals); presence.send({ t: 'portals' });
      if (buildKind === 'jam') { $('b-status').className = 'status ok'; status('Added. Thanks!'); setTimeout(closeBuild, 900); }
      else closeBuild();
    } catch (err) { status(err.message); $('b-submit').disabled = false; }
  };

  addEventListener('keydown', (e) => {
    if (e.code === 'Escape') { if (!$('welcome').hidden) closeWelcome(); else if (!$('build').hidden) closeBuild(); else if (!$('browse').hidden) toggleBrowse(false); else cancelWait(); return; }
    if (e.target instanceof HTMLInputElement) return;
    const n = /^Digit([1-4])$/.exec(e.code)?.[1];
    if (n && !overlayOpen()) { emote(Number(n) - 1); return; }
    if ((e.code === 'Enter' || e.code === 'Space') && current && !overlayOpen()) { e.preventDefault(); enter(); }
  });
  // Emotes: buttons (touch) and keys 1-4. Shown above your figure for everyone in the plaza.
  function emote(i) { if (presence.online) presence.send({ t: 'emote', e: i }); }
  $('emotes').replaceChildren(...EMOTES.map((ch, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'emote'; b.textContent = ch;
    b.setAttribute('aria-label', `Emote ${ch} (key ${i + 1})`);
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.onclick = () => emote(i);
    return b;
  }));
  // First visit: one short card about what this place is. Never shown again on this device.
  if (!getSeenWelcome()) {
    $('welcome').hidden = false;
    $('w-go').focus();
  }
  function closeWelcome() {
    $('welcome').hidden = true;
    setSeenWelcome();
    input.reset();
    const name = $('w-nick').value.trim();
    if (NICK_RE.test(name) && !blocked(name)) { setNickname(name); $('nick').value = name; presence.send({ t: 'nick', nick: name }); }
    lastKey = null;
  }
  $('welcome-form').onsubmit = (e) => { e.preventDefault(); closeWelcome(); };

  // Invite: share the plaza link (native share sheet on phones, clipboard elsewhere).
  $('invite-btn').onclick = async () => {
    const url = location.origin + location.pathname;
    try {
      if (navigator.share) await navigator.share({ title: 'Playverse', text: 'Meet me in Nexus Plaza - we can jump into Vibe Jam together.', url });
      else { await navigator.clipboard.writeText(url); toast('Link copied - send it to a friend'); }
    } catch { /* cancelled */ }
  };
  let toastTimer;
  function toast(text) { $('toast').textContent = text; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2200); }

  addEventListener('resize', resize);
  addEventListener('pageshow', (e) => { if (e.persisted) leaving = false; });

  // ---- Browse all: the accessible, searchable index of everything you can walk to ----
  // Community portals, the duo game list and the race levels, as plain links.
  function card(title, meta, href, external) {
    const li = document.createElement('li'), a = document.createElement('a');
    a.href = href;
    if (external) a.rel = 'noopener noreferrer';
    const t = document.createElement('div'); t.textContent = title; t.style.fontWeight = '700';
    const m = document.createElement('div'); m.className = 'meta'; m.textContent = meta;
    a.append(t, m); li.append(a); return li;
  }
  function heading(text) { const li = document.createElement('li'); li.className = 'group'; li.textContent = text; return li; }
  function renderList(q = '') {
    const needle = q.trim().toLowerCase();
    const has = (...xs) => !needle || xs.some((x) => String(x).toLowerCase().includes(needle));
    const byTitle = (a, b) => a.title.localeCompare(b.title);
    const portals = items.filter((it) => it.kind === 'portal' && has(it.title, it.nickname, hostOf(it.url))).sort(byTitle);
    const games = items.filter((it) => it.kind === 'jam' && has(it.title, it.nickname, hostOf(it.url))).sort(byTitle);
    const races = [...levels.values()].filter(({ level }) => has(level.title, level.author)).sort((a, b) => a.level.title.localeCompare(b.level.title));
    const out = [];
    if (portals.length) {
      out.push(heading('Portals in the plaza'));
      for (const it of portals) out.push(card(it.title, `by ${it.nickname} · ${hostOf(it.url)}${it.multiplayer ? ' · multiplayer' : ''}`, it.url, true));
    }
    if (games.length) {
      out.push(heading('Multiplayer games (duo Vibe Jam list)'));
      for (const it of games) out.push(card(it.title, `added by ${it.nickname} · ${hostOf(it.url)}`, it.url, true));
    }
    if (races.length) {
      out.push(heading('Race levels'));
      for (const { level, info } of races) {
        const best = getBest(level.id, level.version);
        out.push(card(level.title, `by ${level.author} · v${level.version} · ${info.stars} ★` + (best ? ` · best ${fmt(best.timeMs)} s` : ''), `play.html#/w/${level.id}@${level.version}`));
      }
    }
    if (!out.length) { const li = document.createElement('li'); li.textContent = 'Nothing matches.'; out.push(li); }
    $('levels').replaceChildren(...out);
  }
  async function toggleBrowse(open = $('browse').hidden) {
    $('browse').hidden = !open;
    $('browse-btn').setAttribute('aria-expanded', String(open));
    input.reset();
    if (!open) { $('browse-btn').focus(); return; }
    renderList($('search').value);
    $('search').focus();
    await loadLevels();                 // first open: fetch the race levels, then fill them in
    if (!$('browse').hidden) renderList($('search').value);
  }
  $('browse-btn').onclick = () => toggleBrowse();
  $('browse-close').onclick = () => toggleBrowse(false);
  $('search').oninput = (e) => renderList(e.target.value);

  // ---- Loop ----
  // What the player stands on: a portal, an empty pad, or nothing. The plaque follows it.
  function spotHere() {
    if (g.onPortal) return { key: `p:${g.onPortal.x},${g.onPortal.y}`, portal: g.onPortal };
    const tx = Math.floor(g.x), ty = Math.floor(g.y), i = padAt(tx, ty);
    if (i >= 0 && !hubLevel.portals.some((q) => q.x === tx && q.y === ty)) return { key: `pad:${i}`, pad: i };
    return null;
  }
  let lastTick = 0;
  function frame(now) {
    const dt = Math.min(0.25, (now - last) / 1000); acc += dt; last = now;
    while (acc >= STEP) {
      acc -= STEP;
      const moving = overlayOpen() || leaving ? { dx: 0, dy: 0 } : input.read();
      for (const ev of step(g, moving)) if (ev.type === 'start') $('hint').hidden = true;
    }
    const spot = spotHere();
    if (!spot?.portal?.webring && inParty()) cancelWait();   // walked out of the queue
    // Refresh the plaque when the spot changes, and every 250 ms while a countdown runs.
    const key = (spot?.key ?? '') + (party.ids.length ? `:${Math.floor(now / 250)}` : '');
    if (key !== lastKey) { lastKey = key; showPlaque(spot); }
    presence.tick(now, g.x, g.y, dt);
    if (now - lastTick > 1000) { lastTick = now; updateOnline(); }
    const peers = [...presence.peers.values()].map((p) => ({ x: p.rx, y: p.ry, nick: p.nick, color: peerColor(p.id) }));
    const bubbles = [];
    const bubble = (who, x, y) => { const age = (now - who.emoteAt) / 1000; if (who.emote !== null && who.emote !== undefined && age < 2.5) bubbles.push({ x, y, text: EMOTES[who.emote], age }); };
    for (const p of presence.peers.values()) bubble(p, p.rx, p.ry);
    bubble(presence.self, g.x, g.y);
    const cam = view.scroll ? camera(view, hubLevel, g.x, g.y) : null;
    draw(ctx, g, scale, now / 1000, { labels, portalDone, pads: emptyPads(), peers, cam, bubbles });
    requestAnimationFrame(frame);
  }
  await refreshItems();
  setInterval(refreshItems, 60_000);
  resize();
  requestAnimationFrame(frame);
}
main();
