import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validateLevel, minTimeMs, STAR_BONUS_MS } from '../js/level.js';
import { createGame, step, resultMs, STEP } from '../js/engine.js';

const race = (tiles, extra = {}) => ({ id: 'test-level', version: 1, title: 'T', author: 'A', tiles, ...extra });

test('all shipped levels are valid', () => {
  for (const id of readdirSync('levels').filter((d) => !d.endsWith('.json'))) {
    for (const f of readdirSync(`levels/${id}`)) {
      const raw = readFileSync(`levels/${id}/${f}`);
      const res = validateLevel(JSON.parse(raw), { bytes: raw.length });
      assert.ok(res.ok, `${id}/${f}: ${res.errors.join('; ')}`);
    }
  }
});

test('rejects bad schema, unreachable goal, oversize files and unknown fields', () => {
  assert.equal(validateLevel(race(['#####', '#S#G#', '#####'])).ok, false, 'goal behind wall');
  assert.equal(validateLevel(race(['#####', '#S^G#', '#####'])).ok, false, 'goal behind spikes');
  assert.equal(validateLevel(race(['#####', '#S.G#', '####'])).ok, false, 'ragged rows');
  assert.equal(validateLevel(race(['#####', '#S.x#', '#####'])).ok, false, 'bad char');
  assert.equal(validateLevel(race(['#####', '#S.G#', '#####'], { script: 'alert(1)' })).ok, false, 'unknown field');
  assert.equal(validateLevel(race(['#####', '#S.G#', '#####']), { bytes: 9000 }).ok, false, 'too big');
  assert.equal(validateLevel(race(['#####', '#S.G#', '#####'], { id: 'Bad Id' })).ok, false, 'bad id');
  assert.equal(validateLevel(race(['#####', '#S.G#', '#####'])).ok, true, 'minimal level');
});

test('hub levels need reachable portals on floor', () => {
  const tiles = ['######', '#S...#', '######'];
  assert.ok(validateLevel(race(tiles, { type: 'hub', portals: [{ x: 3, y: 1, levelId: 'first-steps' }] })).ok);
  assert.equal(validateLevel(race(tiles, { type: 'hub', portals: [{ x: 0, y: 0, levelId: 'first-steps' }] })).ok, false);
  assert.equal(validateLevel(race(tiles, { type: 'hub', portals: [] })).ok, false);
});

function run(level, dx, dy, maxSteps = 5000) {
  const g = createGame(level);
  const events = [];
  for (let i = 0; i < maxSteps && !g.finished; i++) events.push(...step(g, { dx, dy }));
  return { g, events };
}

test('walking right reaches the goal, and the time respects minTimeMs', () => {
  const level = race(['##########', '#S......G#', '##########']);
  const { g, events } = run(level, 1, 0);
  assert.ok(g.finished);
  const fin = events.find((e) => e.type === 'finish');
  assert.ok(fin.timeMs >= minTimeMs(level), `${fin.timeMs} >= ${minTimeMs(level)}`);
  assert.ok(fin.timeMs < 2000);
});

test('walls stop the player; spikes respawn; stars cut time', () => {
  const walled = run(race(['#####', '#S#G#', '#####']), 1, 0, 600);
  assert.equal(walled.g.finished, false);
  assert.ok(walled.g.x < 2, 'stays left of the wall');

  const spiked = run(race(['#####', '#S^G#', '#####']), 1, 0, 600);
  assert.ok(spiked.g.deaths > 0);
  assert.equal(spiked.g.finished, false);

  const starred = run(race(['#######', '#S.*.G#', '#######']), 1, 0);
  assert.equal(starred.g.stars.size, 1);
  assert.equal(resultMs(starred.g), Math.max(0, Math.round(starred.g.steps * STEP * 1000) - STAR_BONUS_MS));
});

test('timer does not start until the player moves', () => {
  const g = createGame(race(['#####', '#S.G#', '#####']));
  for (let i = 0; i < 100; i++) step(g, { dx: 0, dy: 0 });
  assert.equal(g.steps, 0);
  assert.equal(g.started, false);
});

test('hub emits a portal event once per entry', () => {
  const hub = race(['#######', '#S...#'.padEnd(6, '.') + '#', '#######'], { type: 'hub', portals: [{ x: 4, y: 1, levelId: 'first-steps' }] });
  const { events } = run(hub, 1, 0, 400);
  const portals = events.filter((e) => e.type === 'portal');
  assert.equal(portals.length, 1);
  assert.equal(portals[0].portal.levelId, 'first-steps');
});
