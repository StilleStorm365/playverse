import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, step, resultMs } from '../public/js/engine.js';
import { quantize, createRecorder, checkReplay, simulate, ghostFrames, ghostAt, Q, MAX_STEPS } from '../public/js/replay.js';

const load = (id, v) => JSON.parse(readFileSync(`public/levels/${id}/v${v}.json`, 'utf8'));

// A simple path-following bot: nearest star first, then the goal, steering to tile centres.
function botRun(level, { wobble = false } = {}) {
  const T = level.tiles, H = T.length, W = T[0].length;
  const pos = (ch) => { const r = []; T.forEach((row, y) => [...row].forEach((c, x) => c === ch && r.push([x, y]))); return r; };
  const bfs = (a, b) => {
    const prev = new Map([[a.join(), null]]), q = [a];
    while (q.length) {
      const [x, y] = q.shift(); if (x === b[0] && y === b[1]) break;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = [x + dx, y + dy];
        if (n[0] < 0 || n[1] < 0 || n[0] >= W || n[1] >= H || '#^'.includes(T[n[1]][n[0]]) || prev.has(n.join())) continue;
        prev.set(n.join(), [x, y]); q.push(n);
      }
    }
    const path = []; for (let c = b; c; c = prev.get(c.join())) path.unshift(c); return path;
  };
  let cur = pos('S')[0]; const stars = pos('*'), route = [];
  while (stars.length) { stars.sort((p, q) => bfs(cur, p).length - bfs(cur, q).length); const s = stars.shift(); route.push(...bfs(cur, s).slice(1)); cur = s; }
  route.push(...bfs(cur, pos('G')[0]).slice(1));

  const g = createGame(level), rec = createRecorder();
  let i = 0, n = 0, timeMs = null;
  while (timeMs === null && n++ < 20000) {
    const [tx, ty] = route[Math.min(i, route.length - 1)];
    const dx = tx + 0.5 - g.x, dy = ty + 0.5 - g.y;
    if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05 && i < route.length - 1) { i++; continue; }
    // Analog-ish input (like the touch joystick) to exercise quantisation and diagonal normalising.
    const k = wobble ? 0.7 + 0.3 * Math.sin(n / 7) : 1;
    const q = quantize({ dx: Math.max(-1, Math.min(1, dx * 8)) * k, dy: Math.max(-1, Math.min(1, dy * 8)) * k });
    const before = g.steps;
    for (const ev of step(g, q.input)) if (ev.type === 'finish') timeMs = ev.timeMs;
    if (g.steps > before) rec.push(q.qx, q.qy);
  }
  return { timeMs, replay: rec.data(), g };
}

test('quantize clamps and rounds to 1/Q', () => {
  assert.deepEqual(quantize({ dx: 1, dy: -1 }), { qx: Q, qy: -Q, input: { dx: 1, dy: -1 } });
  assert.deepEqual(quantize({ dx: 3, dy: 0.49 / Q }).qx, Q);
  assert.equal(quantize({ dx: 0.5, dy: 0 }).input.dx, 0.5);
});

test('a recorded run re-simulates to exactly the same time', () => {
  for (const [id, v] of [['first-steps', 1], ['spike-garden', 1], ['switchback', 2]]) {
    for (const wobble of [false, true]) {
      const level = load(id, v);
      const { timeMs, replay, g } = botRun(level, { wobble });
      assert.ok(timeMs !== null, `${id} bot finished`);
      assert.equal(checkReplay(replay), null);
      const res = simulate(level, replay);
      assert.equal(res.finished, true);
      assert.equal(res.timeMs, timeMs, `${id} wobble=${wobble}`);
      assert.equal(res.timeMs, resultMs(g));
      assert.ok(replay.runs.length < 2000, 'compact');
    }
  }
});

test('ghost frames follow the run and wait at the start', () => {
  const level = load('first-steps', 1);
  const { replay } = botRun(level);
  const ghost = ghostFrames(level, replay);
  const spawn = createGame(level).spawn;
  assert.deepEqual(ghostAt(ghost, level, 0, spawn), { ...spawn, done: false });
  assert.equal(ghostAt(ghost, level, ghost.steps + 50, spawn).done, true);
});

test('bad or forged replays are rejected', () => {
  const level = load('first-steps', 1);
  const { replay } = botRun(level);
  assert.match(checkReplay(null), /object/);
  assert.match(checkReplay({ v: 2, runs: [[1, 0, 0]] }), /version/);
  assert.match(checkReplay({ v: 1, runs: [[1, 17, 0]] }), /input/);
  assert.match(checkReplay({ v: 1, runs: [[0.5, 1, 0]] }), /length/);
  assert.match(checkReplay({ v: 1, runs: [[MAX_STEPS + 1, 1, 0]] }), /too long/);
  // Cutting the run short means it never finishes.
  const short = { v: 1, runs: replay.runs.slice(0, -1) };
  assert.equal(simulate(level, short).finished, false);
  // Extra input after the finish is refused.
  const long = { v: 1, runs: [...replay.runs, [5, 1, 0]] };
  assert.equal(simulate(level, long).finished, false);
  // Walking straight right from the start does not finish.
  assert.equal(simulate(level, { v: 1, runs: [[600, Q, 0]] }).finished, false);
});

test('worst-case simulation is cheap (Workers CPU budget)', () => {
  const level = load('switchback', 2);
  const runs = []; for (let i = 0; i < MAX_STEPS / 120; i++) runs.push([60, Q, Q / 2], [60, -Q, -Q]);
  const t0 = performance.now();
  simulate(level, { v: 1, runs });
  const ms = performance.now() - t0;
  assert.ok(ms < 50, `took ${ms.toFixed(1)} ms`);
  console.log(`# worst case ${MAX_STEPS} steps: ${ms.toFixed(1)} ms`);
});
