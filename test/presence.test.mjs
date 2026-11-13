// The reconnect loop, driven with a fake WebSocket and fake clock.
//
// Why: on 14/11 a hub whose room was unreachable stayed offline for good. When a handshake hung,
// the client saw a socket in CONNECTING, returned without scheduling anything, and nothing ever
// woke it again - the plaza stayed empty even after the room came back and answered.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const sockets = [];
globalThis.location = { protocol: 'http:', host: 'playverse.test' };
globalThis.document = { hidden: false, addEventListener() {} };
globalThis.addEventListener = () => {};
globalThis.WebSocket = class {
  constructor(url) { this.url = url; this.readyState = 0; sockets.push(this); }        // stays CONNECTING
  send() {}
  close() { this.readyState = 3; this.onclose?.({ code: 1006 }); }
};
const { connectPresence } = await import('../public/js/presence.js');

test('a handshake that hangs does not end the plaza', () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  sockets.length = 0;
  const events = [];
  const p = connectPresence({ nick: () => 'guest', pos: () => ({ x: 1, y: 1 }), onEvent: (m) => events.push(m.t) });

  assert.equal(sockets.length, 1, 'tries once at the start');
  assert.equal(p.state, 'connecting');

  mock.timers.tick(5000);
  assert.equal(sockets.length, 1, 'does not pile up sockets while one is still connecting');

  mock.timers.tick(6000);                       // past CONNECT_MS: the hung one is given up
  assert.ok(events.includes('offline'), 'the player is told');
  assert.equal(p.state, 'offline');

  const run = (seconds) => { for (let i = 0; i < seconds; i++) mock.timers.tick(1000); };
  run(5);
  assert.ok(sockets.length >= 2, `tries again (${sockets.length} attempts)`);

  // ...and keeps trying for as long as it takes.
  const before = sockets.length;
  run(120);
  assert.ok(sockets.length > before + 1, `still trying after two minutes (${sockets.length} attempts)`);

  // When the room answers, we are back in the plaza.
  const last = sockets[sockets.length - 1];
  last.readyState = 1; last.onopen();
  last.onmessage({ data: JSON.stringify({ t: 'welcome', id: 7, players: [], party: { ids: [], endsAt: 0 } }) });
  assert.equal(p.state, 'online');
  mock.timers.reset();
});
