// The hub: a walkable room (a level of type "hub") whose portals lead to race levels.
import { createGame, step, STEP } from './engine.js';
import { fit, draw } from './render.js';
import { createInput } from './input.js';
import { loadPublished, loadLevel } from './levels.js';
import { getBest } from './store.js';
import { fetchTop } from './leaderboard.js';

const $ = (id) => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d'), stage = $('stage');
const fmt = (ms) => (ms / 1000).toFixed(2);

function showError(msg) { $('error-text').textContent = msg; $('error').hidden = false; $('hint').hidden = true; }

async function main() {
  let pub, hub;
  try {
    pub = await loadPublished();
    if (!pub.hub) throw new Error('No hub is published');
    ({ level: hub } = await loadLevel('hub', pub.hub));
    if (hub.type !== 'hub') throw new Error('The hub level is not a hub');
  } catch (e) { return showError(e.message); }

  // Load every published race level once: used by portals (plaques) and Browse all.
  const levels = new Map();
  await Promise.all(Object.entries(pub).filter(([id]) => id !== 'hub').map(async ([id, v]) => {
    try { const { level, info } = await loadLevel(id, v); if (level.type === 'race') levels.set(id, { level, info }); } catch { /* skip broken */ }
  }));
  const portals = hub.portals.filter((p) => levels.has(p.levelId));
  const hubLevel = { ...hub, portals };
  const tops = new Map(); // levelId -> top score or null

  // Spawn in front of the portal we came back from (deep link "#/from/<id>"), else at S.
  const from = /^#\/from\/([a-z0-9-]+)$/.exec(location.hash)?.[1];
  const back = portals.find((p) => p.levelId === from);
  const below = back && hub.tiles[back.y + 1]?.[back.x] === '.' ? { x: back.x, y: back.y + 1 } : null;
  const g = createGame(hubLevel, below || undefined);
  if (from) history.replaceState(null, '', location.pathname);

  const input = createInput(stage);
  let scale, acc = 0, last = performance.now(), current = null;
  const labels = (p) => levels.get(p.levelId)?.level.title;
  const portalDone = (p) => { const l = levels.get(p.levelId)?.level; return l && getBest(l.id, l.version); };

  function resize() { scale = fit(canvas, hubLevel, { width: stage.clientWidth - 16, height: stage.clientHeight - 48 }); }
  const enter = () => { if (current) location.href = `play.html#/w/${current.level.id}@${current.level.version}`; };

  function showPlaque(p) {
    current = p ? levels.get(p.levelId) : null;
    $('plaque').hidden = !current;
    if (!current) return;
    const { level, info } = current;
    $('p-title').textContent = level.title;
    $('p-meta').textContent = `by ${level.author} · v${level.version} · ${info.stars} ★`;
    const best = getBest(level.id, level.version);
    $('p-best').textContent = best ? `Your best: ${fmt(best.timeMs)} s` : 'Not played yet';
    const showTop = () => {
      const t = tops.get(level.id);
      $('p-top').textContent = t ? `Record: ${fmt(t.timeMs)} s by ${t.nickname}` : t === null ? 'No record yet' : '';
    };
    showTop();
    if (!tops.has(level.id)) {
      fetchTop(level.id, level.version)
        .then((d) => { tops.set(level.id, d.scores[0] || null); if (current?.level.id === level.id) showTop(); })
        .catch(() => { tops.set(level.id, undefined); });
    }
  }
  if (below) showPlaque(back);

  $('p-enter').onclick = enter;
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if ((e.code === 'Enter' || e.code === 'Space') && current && $('browse').hidden) { e.preventDefault(); enter(); }
    if (e.code === 'Escape') toggleBrowse(false);
  });
  addEventListener('resize', resize);

  // Browse all: the accessible, searchable index of every level.
  function renderList(q = '') {
    const needle = q.trim().toLowerCase();
    const items = [...levels.values()]
      .filter(({ level }) => !needle || level.title.toLowerCase().includes(needle) || level.author.toLowerCase().includes(needle))
      .sort((a, b) => a.level.title.localeCompare(b.level.title));
    $('levels').replaceChildren(...items.map(({ level, info }) => {
      const li = document.createElement('li'), a = document.createElement('a');
      a.href = `play.html#/w/${level.id}@${level.version}`;
      const t = document.createElement('div'); t.textContent = level.title; t.style.fontWeight = '700';
      const best = getBest(level.id, level.version);
      const m = document.createElement('div'); m.className = 'meta';
      m.textContent = `by ${level.author} · v${level.version} · ${info.stars} ★` + (best ? ` · best ${fmt(best.timeMs)} s` : '');
      a.append(t, m); li.append(a); return li;
    }));
    if (!items.length) { const li = document.createElement('li'); li.textContent = 'No levels match.'; $('levels').append(li); }
  }
  function toggleBrowse(open = $('browse').hidden) {
    $('browse').hidden = !open;
    $('browse-btn').setAttribute('aria-expanded', String(open));
    input.reset();
    if (open) { renderList($('search').value); $('search').focus(); } else $('browse-btn').focus();
  }
  $('browse-btn').onclick = () => toggleBrowse();
  $('browse-close').onclick = () => toggleBrowse(false);
  $('search').oninput = (e) => renderList(e.target.value);

  function frame(now) {
    acc += Math.min(0.25, (now - last) / 1000); last = now;
    while (acc >= STEP) {
      acc -= STEP;
      const moving = $('browse').hidden ? input.read() : { dx: 0, dy: 0 };
      for (const ev of step(g, moving)) {
        if (ev.type === 'start') $('hint').hidden = true;
        if (ev.type === 'portal') showPlaque(ev.portal);
      }
      if (!g.onPortal && current && g.started) showPlaque(null);
    }
    draw(ctx, g, scale, now / 1000, { labels, portalDone });
    requestAnimationFrame(frame);
  }
  resize();
  requestAnimationFrame(frame);
}
main();
