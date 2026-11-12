import { createGame, step, STEP, elapsedMs, resultMs } from './engine.js';
import { fit, draw } from './render.js';
import { createInput } from './input.js';
import { loadLevel, parseWorldHash } from './levels.js';
import { getBest, setBest } from './store.js';
import { STAR_BONUS_MS } from './level.js';
import { mountBoard } from './leaderboard.js';

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
  let g, scale, acc = 0, last = performance.now(), flashUntil = 0;
  const totalStars = info.stars;

  const baseHint = $('hint').textContent;
  function resize() {
    scale = fit(canvas, level, { width: stage.clientWidth - 16, height: stage.clientHeight - 48 });
    const portrait = innerHeight > innerWidth && level.tiles[0].length > level.tiles.length;
    $('hint').textContent = portrait ? 'Drag to move · turn your phone sideways for a bigger view' : baseHint;
  }
  function reset() {
    g = createGame(level); acc = 0; input.reset();
    $('finish').hidden = true; $('hint').hidden = false;
    $('stars').textContent = `0/${totalStars}`;
  }
  function finish(timeMs) {
    const raw = elapsedMs(g), bonus = g.stars.size * STAR_BONUS_MS;
    $('final').textContent = `${fmt(timeMs)} s`;
    $('breakdown').textContent = `${fmt(raw)} s − ${g.stars.size} ★ × ${STAR_BONUS_MS / 1000} s` + (g.deaths ? ` · ${g.deaths} spike hit${g.deaths > 1 ? 's' : ''}` : '');
    const prev = getBest(level.id, level.version);
    const improved = setBest(level.id, level.version, { timeMs, stars: g.stars.size, at: Date.now() });
    $('best').textContent = improved ? (prev ? `New personal best! (was ${fmt(prev.timeMs)} s)` : 'Personal best saved.') : `Personal best: ${fmt(prev.timeMs)} s`;
    $('finish').hidden = false;
    mountBoard($('board-slot'), { levelId: level.id, version: level.version, timeMs, minTimeMs: info.minTimeMs });
    $('retry').focus();
  }

  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === 'KeyR') reset();
    if (e.code === 'Escape') goBack();
  });
  $('retry').onclick = reset;
  addEventListener('resize', resize);

  function frame(now) {
    acc += Math.min(0.25, (now - last) / 1000); last = now;
    while (acc >= STEP) {
      acc -= STEP;
      for (const ev of step(g, input.read())) {
        if (ev.type === 'start') $('hint').hidden = true;
        if (ev.type === 'star') { $('stars').textContent = `${g.stars.size}/${totalStars}`; toast(`★ −${STAR_BONUS_MS / 1000} s`); }
        if (ev.type === 'death') { flashUntil = now + 250; toast('Ouch! Back to start'); }
        if (ev.type === 'finish') finish(ev.timeMs);
      }
    }
    $('time').textContent = fmt(g.finished ? resultMs(g) : elapsedMs(g));
    draw(ctx, g, scale, now / 1000, { flash: now < flashUntil });
    requestAnimationFrame(frame);
  }
  resize(); reset();
  requestAnimationFrame(frame);
}
main();
