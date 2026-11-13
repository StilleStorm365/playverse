import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLevel } from '../public/js/level.js';
import { safeRef, parseArrival, exitUrl, returnUrl } from '../public/js/webring.js';

const SELF = 'https://playverse.pages.dev/';
const hub = (portals) => ({
  id: 'hub', version: 9, title: 'H', author: 'A', type: 'hub',
  tiles: ['#####', '#S..#', '#####'], portals,
});

test('hub portals: level or known webring, never both, nothing else', () => {
  assert.equal(validateLevel(hub([{ x: 3, y: 1, webring: 'vibejam-2026' }])).ok, true);
  assert.equal(validateLevel(hub([{ x: 3, y: 1, webring: 'evil-ring' }])).ok, false, 'unknown ring');
  assert.equal(validateLevel(hub([{ x: 3, y: 1, webring: 'vibejam-2026', levelId: 'first-steps' }])).ok, false, 'both');
  assert.equal(validateLevel(hub([{ x: 3, y: 1, webring: 'vibejam-2026', url: 'https://x' }])).ok, false, 'extra url field');
  assert.equal(validateLevel(hub([{ x: 3, y: 1 }])).ok, false, 'neither');
});

test('safeRef accepts hosts and http(s) URLs only', () => {
  assert.equal(safeRef('fly.pieter.com').href, 'https://fly.pieter.com/');
  assert.equal(safeRef('https://game.example/play?x=1').hostname, 'game.example');
  assert.equal(safeRef('javascript:alert(1)'), null);
  assert.equal(safeRef('data:text/html,hi'), null);
  assert.equal(safeRef('https://user:pw@evil.example'), null);
  assert.equal(safeRef(''), null);
  assert.equal(safeRef(null), null);
});

test('parseArrival needs portal=true and keeps only known, short params', () => {
  assert.equal(parseArrival('?ref=fly.pieter.com'), null);
  const a = parseArrival('?portal=true&ref=fly.pieter.com&username=levelsio&color=red&speed=5&evil=1&hp=' + 'x'.repeat(300));
  assert.equal(a.ref.hostname, 'fly.pieter.com');
  assert.deepEqual(a.params, { username: 'levelsio', color: 'red', speed: '5' });
  assert.equal(a.nickname, 'levelsio');
  assert.equal(parseArrival('?portal=true&username=<b>x</b>').nickname, null, 'unsafe names are not used as nickname');
  assert.equal(parseArrival('?portal=1').ref, null, 'no ref, no return portal');
});

test('exit and return URLs follow the protocol', () => {
  const out = new URL(exitUrl('vibejam-2026', { selfUrl: SELF, nickname: 'Tommy' }));
  assert.equal(out.origin + out.pathname, 'https://vibejam.com/portal/2026');
  assert.equal(out.searchParams.get('portal'), 'true');
  assert.equal(out.searchParams.get('username'), 'Tommy');
  assert.equal(out.searchParams.get('ref'), SELF);
  assert.equal(out.searchParams.get('speed'), '5');
  assert.equal(exitUrl('nope', { selfUrl: SELF }), null);

  const a = parseArrival('?portal=true&ref=fly.pieter.com&username=levelsio&color=red');
  const back = new URL(returnUrl(a, { selfUrl: SELF }));
  assert.equal(back.hostname, 'fly.pieter.com');
  assert.equal(back.searchParams.get('portal'), 'true');
  assert.equal(back.searchParams.get('username'), 'levelsio');
  assert.equal(back.searchParams.get('color'), 'red');
  assert.equal(back.searchParams.get('ref'), SELF);
  // Passing through the exit after arriving keeps what the player came with.
  const via = new URL(exitUrl('vibejam-2026', { selfUrl: SELF, arrival: a }));
  assert.equal(via.searchParams.get('color'), 'red');
  assert.equal(via.searchParams.get('username'), 'levelsio');
  assert.equal(returnUrl(parseArrival('?portal=true'), { selfUrl: SELF }), null);
});
