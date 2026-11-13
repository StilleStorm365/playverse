import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanUrl, checkSubmission, pickDuoGame } from '../public/js/community.js';
import { validateLevel } from '../public/js/level.js';

test('cleanUrl accepts public https links only', () => {
  assert.equal(cleanUrl('https://fly.pieter.com'), 'https://fly.pieter.com/');
  assert.equal(cleanUrl('example.com/game?x=1'), 'https://example.com/game?x=1');
  for (const bad of ['http://example.com', 'javascript:alert(1)', 'data:text/html,hi', 'https://user:pw@example.com',
    'https://127.0.0.1/', 'https://localhost/', 'https://[::1]/', 'https://intranet/', 'https://example.com:8443/', 'ftp://example.com', '', 'https://' + 'a'.repeat(300) + '.com']) {
    assert.equal(cleanUrl(bad), null, bad);
  }
});

test('checkSubmission validates and cleans', () => {
  const ok = checkSubmission({ kind: 'portal', pad: 2, title: '  My   game ', url: 'my.game', nickname: 'Tommy', multiplayer: true }, { padCount: 5 });
  assert.deepEqual(ok.value, { kind: 'portal', pad: 2, title: 'My game', url: 'https://my.game/', multiplayer: true, nickname: 'Tommy' });
  assert.match(checkSubmission({ kind: 'portal', pad: 5, title: 'ab', url: 'my.game', nickname: 'Tommy' }, { padCount: 5 }).error, /pad/);
  assert.match(checkSubmission({ kind: 'portal', pad: 0, title: '<b>x</b>', url: 'my.game', nickname: 'Tommy' }, { padCount: 5 }).error, /Title/);
  assert.match(checkSubmission({ kind: 'jam', title: 'Good', url: 'my.game', nickname: 'x' }).error, /Name/);
  assert.match(checkSubmission({ kind: 'jam', title: 'porn stuff', url: 'my.game', nickname: 'Tommy' }).error, /another title/);
  assert.match(checkSubmission({ kind: 'other', title: 'Good', url: 'my.game', nickname: 'Tommy' }).error, /kind/);
  const jam = checkSubmission({ kind: 'jam', title: 'Fly', url: 'https://fly.pieter.com', nickname: 'Tommy', multiplayer: false });
  assert.equal(jam.value.multiplayer, true);   // the jam list is multiplayer by definition
  assert.equal(jam.value.pad, null);
});

test('pickDuoGame gives every client the same game for the same seed', () => {
  const items = [{ id: 7, multiplayer: true, url: 'b' }, { id: 3, multiplayer: true, url: 'a' }, { id: 5, multiplayer: false, url: 'x' }];
  assert.equal(pickDuoGame(items, 0).url, 'a');
  assert.equal(pickDuoGame([...items].reverse(), 0.99).url, 'b');
  assert.equal(pickDuoGame(items.filter((i) => !i.multiplayer), 0.5), null);
  assert.equal(pickDuoGame(items, 1), null);
});

test('hub pads must be free, reachable floor tiles', () => {
  const hub = JSON.parse(readFileSync('public/levels/hub/v3.json', 'utf8'));
  assert.equal(validateLevel(hub).ok, true);
  assert.equal(hub.pads.length, 21);
  const onPortal = { ...hub, pads: [...hub.pads, { x: 12, y: 7 }] };
  assert.match(validateLevel(onPortal).errors.join(), /overlaps/);
  const onWall = { ...hub, pads: [{ x: 0, y: 0 }] };
  assert.match(validateLevel(onWall).errors.join(), /floor/);
  const race = JSON.parse(readFileSync('public/levels/first-steps/v1.json', 'utf8'));
  assert.match(validateLevel({ ...race, pads: [] }).errors.join(), /only hub/);
});
