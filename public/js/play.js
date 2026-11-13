import { createGame, step, STEP, elapsedMs, resultMs } from './engine.js';
import { fit, draw } from './render.js';
import { createInput } from './input.js';
import { loadLevel, parseWorldHash } from './levels.js';
import { getBest, setBest, getNickname, getGhostsOn, setGhostsOn } from './store.js';
import { STAR_BONUS_MS } from './level.js';
import { mountBoard, fetchTop } from './leaderboard.js';
import { quantize, createRecorder, ghostFrames, ghostAt } from './replay.js';

const $ = (id) => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d'), stage = $('stage');
const fmt = (ms) => (ms / 1000).toFixed(2);

const route = parseWorldHash(location.hash);
addEventListener('hashchange', () => location.reload());
const hubUrl = route ? `./#/from/${route.id}` : './';
$('back').href = hubUrl;
const goBack = () => { location.href = hubUrl; };
$('back2').onclick = goBack;
$('error-back').onclick = goBack;

function showError(msg) { $('error-text').textContent = msg; $('error').hidden = false; $('title').textContent = 'Error'; $('hint').hidden = true; }

let toastTimer;
function toast(msg) {
  const el = $('toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1200);
}

async function main() {
  if (!route) return showError('No level selected.');
  let level, info;
  try { ({ level, info } = await loadLevel(route.id, route.version)); } catch (e) { return showError(e.message); }
  if (level.type === 'hub') return showError('This is a hub, not a race level.');
  document.title = `${level.title} – Playverse`;
  $('title').textContent = `${level.title} · v${level.version}`;

  const input = createInput(stage);
  let g, rec, scale, acc = 0, last = performance.now(), flashUntil = 0;

  // Ghosts: your own best run (stored on this device) and the record run (from the server).
  // Both start when you start moving and replay the exact input of that run.
  let ghostsOn = getGhostsOn();
  const ghosts = { mine: null, record: null };
  function loadMyGhost() {
    const best = getBest(level.id, level.version);
    const gh = best?.replay ? ghostFrames(level, best.replay) : null;
    ghosts.mine = gh && { ...gh, label: 'You', color: '#f4f1ff' };
  }
  function loadRecordGhost() {
    fetchTop(level.id, level.version, { ghost: true }).then((data) => {
      const r = data.ghost, gh = r?.replay ? ghostFrames(level, r.replay) : null;
      ghosts.record = gh && { ...gh, label: `★ ${r.nickname}`, color: '#ffcc4d', nickname: r.nickname };
    }).catch(() => { /* offline: no record ghost */ });
  }
  function visibleGhosts() {
    if (!ghostsOn) return [];
    const list = [];
    const { mine, record } = ghosts;
    if (record) list.push(record);
    // Skip your own ghost when it is the record run (same nickname and time).
    if (mine && !(record && record.nickname === getNickname() && record.timeMs === mine.timeMs)) list.push(mine);
    return list.map((gh) => ({ ...gh, ...ghostAt(gh, level, g.steps, g.spawn) }));
  }
  loadMyGhost(); loadRecordGhost();
  const totalStars = info.stars;

  const baseHint = $('hint').textContent;
  function resize() {
    scale = fit(canvas, level, { width: stage.clientWidth - 16, height: stage.clientHeight - 48 });
    const portrait = innerHeight > innerWidth && level.tiles[0].length > level.tiles.length;
    $('hint').textContent = portrait ? 'Drag to move · turn your phone sideways for a bigger view' : baseHint;
  }
  function reset() {
    g = createGame(level); rec = createRecorder(); acc = 0; input.reset();
    $('finish').hidden = true; $('hint').hidden = false;
    $('stars').textContent = `0/${totalStars}`;
  }
  function finish(timeMs) {
    const raw = elapsedMs(g), bonus = g.stars.size * STAR_BONUS_MS;
    $('final').textContent = `${fmt(timeMs)} s`;
    $('breakdown').textContent = `${fmt(raw)} s − ${g.stars.size} ★ × ${STAR_BONUS_MS / 1000} s` + (g.deaths ? ` · ${g.deaths} spike hit${g.deaths > 1 ? 's' : ''}` : '');
    const prev = getBest(level.id, level.version);
    const replay = rec.data();
    const improved = setBest(level.id, level.version, { timeMs, stars: g.stars.size, at: Date.now(), replay });
    if (improved) loadMyGhost();
    $('best').textContent = improved ? (prev ? `New personal best! (was ${fmt(prev.timeMs)} s)` : 'Personal best saved.') : `Personal best: ${fmt(prev.timeMs)} s`;
    $('finish').hidden = false;
    mountBoard($('board-slot'), {
      levelId: level.id, version: level.version, timeMs, replay,
      onSubmitted: (res) => { if (!ghosts.record || res.timeMs < ghosts.record.timeMs) loadRecordGhost(); },
    });
    $('retry').focus();
  }

  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === 'KeyR') reset();
    if (e.code === 'KeyG') { ghostsOn = !ghostsOn; setGhostsOn(ghostsOn); toast(ghostsOn ? 'Ghosts on' : 'Ghosts off'); }
    if (e.code === 'Escape') goBack();
  });
  $('retry').onclick = reset;
  addEventListener('resize', resize);

  function frame(now) {
    acc += Math.min(0.25, (now - last) / 1000); last = now;
    while (acc >= STEP) {
      acc -= STEP;
      const q = quantize(input.read()), before = g.steps;
      const events = step(g, q.input);
      if (g.steps > before) rec.push(q.qx, q.qy);   // record every step that advanced the run
      for (const ev of events) {
        if (ev.type === 'start') $('hint').hidden = true;
        if (ev.type === 'star') { $('stars').textContent = `${g.stars.size}/${totalStars}`; toast(`★ −${STAR_BONUS_MS / 1000} s`); }
        if (ev.type === 'death') { flashUntil = now + 250; toast('Ouch! Back to start'); }
        if (ev.type === 'finish') finish(ev.timeMs);
      }
    }
    $('time').textContent = fmt(g.finished ? resultMs(g) : elapsedMs(g));
    draw(ctx, g, scale, now / 1000, { flash: now < flashUntil, ghosts: visibleGhosts() });
    requestAnimationFrame(frame);
  }
  resize(); reset();
  requestAnimationFrame(frame);
}
main();
