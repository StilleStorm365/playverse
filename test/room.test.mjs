import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampCoord, cleanNick, publicPlayer, countMessage, validEmote,
  partyJoin, partyLeave, goMessages, MSG_PER_SEC, PARTY_MS, EMOTES, MAX_COORD,
} from '../room/src/protocol.js';

test('coordinates are clamped to the world and rounded', () => {
  assert.equal(clampCoord(12.3456), 12.35);
  assert.equal(clampCoord(-5), 0);
  assert.equal(clampCoord(1e9), MAX_COORD);
  for (const bad of [NaN, Infinity, 'a', null, undefined, {}]) assert.equal(clampCoord(bad), 0);
});

test('nicknames are filtered, never passed through raw', () => {
  assert.equal(cleanNick('  Tommy  '), 'Tommy');
  for (const bad of ['', 'x', 'a'.repeat(17), '<script>', 'admin', 'nazi', 42, null, { nick: 'x' }]) {
    assert.equal(cleanNick(bad), 'guest', String(bad));
  }
});

test('only id, nick and position reach other players', () => {
  assert.deepEqual(publicPlayer({ id: '1', nick: 'Mia', x: 2, y: 3, ip: 'secret', win: 1, n: 5 }), { id: '1', nick: 'Mia', x: 2, y: 3 });
});

test('a flood is cut off, and the next second starts fresh', () => {
  const a = { win: 0, n: 0 };
  for (let i = 0; i < MSG_PER_SEC; i++) assert.equal(countMessage(a, 10_000), true, `message ${i}`);
  assert.equal(countMessage(a, 10_000), false);
  assert.equal(countMessage(a, 11_500), true);
});

test('emotes must be known ones', () => {
  for (let e = 0; e < EMOTES; e++) assert.equal(validEmote(e), true);
  for (const bad of [-1, EMOTES, 1.5, '1', null, undefined, NaN]) assert.equal(validEmote(bad), false);
});

test('the duo queue opens one window and never counts a player twice', () => {
  const first = partyJoin(null, 'a', 1000);
  assert.deepEqual(first, { ids: ['a'], endsAt: 1000 + PARTY_MS });
  const second = partyJoin(first, 'b', 2000);
  assert.deepEqual(second.ids, ['a', 'b']);
  assert.equal(second.endsAt, first.endsAt, 'a late joiner does not extend the window');
  assert.deepEqual(partyJoin(second, 'b', 2500).ids, ['a', 'b']);
  // A window that has run out starts a new one.
  assert.equal(partyJoin(first, 'c', 9000).endsAt, 9000 + PARTY_MS);
  assert.deepEqual(partyJoin(first, 'c', 9000).ids, ['c']);
  // Joining does not change the queue it was given.
  assert.deepEqual(first.ids, ['a']);
});

test('leaving the portal empties the queue', () => {
  const party = partyJoin(partyJoin(null, 'a', 0), 'b', 0);
  assert.deepEqual(partyLeave(party, 'a').ids, ['b']);
  assert.equal(partyLeave(partyLeave(party, 'a'), 'b'), null);
  assert.equal(partyLeave(null, 'a'), null);
  assert.equal(partyLeave(party, 'nobody'), party, 'an unknown id changes nothing');
});

test('two or more travel together on one seed; alone is solo', () => {
  const two = goMessages([{ id: 'a', nick: 'Mia' }, { id: 'b', nick: 'Jonas' }], 0.5);
  assert.deepEqual(two.map((g) => g.msg.mode), ['duo', 'duo']);
  assert.deepEqual(two.map((g) => g.msg.seed), [0.5, 0.5], 'same seed = same game');
  assert.deepEqual(two[0].msg.with, ['Jonas']);
  assert.deepEqual(two[1].msg.with, ['Mia']);
  const one = goMessages([{ id: 'a', nick: 'Mia' }], 0.1);
  assert.equal(one[0].msg.mode, 'solo');
  assert.deepEqual(one[0].msg.with, []);
  // Two players with the same name still see each other (filtered by id, not by name).
  const guests = goMessages([{ id: 'a', nick: 'guest' }, { id: 'b', nick: 'guest' }], 0.2);
  assert.deepEqual(guests[0].msg.with, ['guest']);
  assert.deepEqual(guests[1].msg.with, ['guest']);
});
