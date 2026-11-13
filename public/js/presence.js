// Hub presence client: a WebSocket to /api/room. Other players are kept in `peers` and drawn
// with a little smoothing. Reconnects with backoff; if the room is unavailable the hub still works solo.
//
// A tab nobody is looking at leaves the plaza: after HIDDEN_GRACE_MS hidden it disconnects, and it
// comes back when the tab does. Otherwise forgotten tabs would stand around as ghosts and hold one
// of the 40 places. While visible it pings, so the room can tell a live player from a dead socket.
//
// PING_MS also keeps the connection open at all: measured on 2026-11-13, a socket with no traffic
// for about a minute is dropped (code 1006) somewhere between the browser and the room, while one
// pinging every 30 s lived happily. Without a ping, a player standing still would be thrown out and
// reconnected every minute, which everyone else would see as leaving and joining over and over.
const CLOSE_FULL = 4001;         // the room's own close code: MAX_PLAYERS reached
const HIDDEN_GRACE_MS = 60_000;  // switching tabs for a moment should not make you vanish
const PING_MS = 25_000;          // comfortably under the ~60 s idle limit measured above

export function connectPresence({ nick, pos, onEvent }) {
  const peers = new Map();
  const self = { emote: null, emoteAt: 0 };   // our own emote, echoed back by the server
  let ws = null, id = null, retry = 1000, lastSent = 0, lx = null, ly = null;
  let away = false, hideTimer = null, pingTimer = null, reopenTimer = null;
  const send = (m) => { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); };
  const reopen = (ms) => { clearTimeout(reopenTimer); reopenTimer = setTimeout(() => { if (!away) open(); }, ms); };

  function open() {
    if (away || ws?.readyState === 0 || ws?.readyState === 1) return;
    try { ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/room`); } catch { return; }
    ws.onopen = () => {
      retry = 1000; const p = pos(); lx = p.x; ly = p.y;
      send({ t: 'hi', nick: nick(), x: p.x, y: p.y });
      clearInterval(pingTimer); pingTimer = setInterval(() => send({ t: 'ping' }), PING_MS);
    };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'welcome') {
        id = m.id; peers.clear();
        for (const p of m.players) peers.set(p.id, { ...p, rx: p.x, ry: p.y });
        onEvent({ t: 'party', ...m.party }); onEvent({ t: 'online' });
      } else if (m.t === 'join') peers.set(m.id, { ...m, rx: m.x, ry: m.y });
      else if (m.t === 'pos') { const p = peers.get(m.id); if (p) { p.x = m.x; p.y = m.y; } }
      else if (m.t === 'nick') { const p = peers.get(m.id); if (p) p.nick = m.nick; }
      else if (m.t === 'leave') peers.delete(m.id);
      else if (m.t === 'emote') { const p = m.id === id ? self : peers.get(m.id); if (p) { p.emote = m.e; p.emoteAt = performance.now(); } }
      else onEvent(m);
    };
    ws.onclose = (e) => {
      const was = id !== null; id = null; peers.clear();
      clearInterval(pingTimer);
      if (was) onEvent({ t: 'offline' });
      if (e.code === CLOSE_FULL) { onEvent({ t: 'full' }); retry = 15000; }
      reopen(retry); retry = Math.min(retry * 2, 20000);
    };
  }

  // Leave while the tab is hidden, come back when it is looked at again.
  document.addEventListener('visibilitychange', () => {
    clearTimeout(hideTimer);
    if (document.hidden) {
      hideTimer = setTimeout(() => { away = true; try { ws?.close(1000, 'away'); } catch { /* already gone */ } }, HIDDEN_GRACE_MS);
    } else if (away) { away = false; retry = 1000; open(); }
  });
  addEventListener('pagehide', () => { try { ws?.close(1000, 'bye'); } catch { /* already gone */ } });

  open();

  return {
    peers, self, send,
    get online() { return id !== null; },
    get id() { return id; },
    /** Call every frame: sends our position at most 10 times a second, and only when it changed. */
    tick(now, x, y, dt) {
      for (const p of peers.values()) { const k = Math.min(1, dt * 12); p.rx += (p.x - p.rx) * k; p.ry += (p.y - p.ry) * k; }
      if (id === null || now - lastSent < 100 || (x === lx && y === ly)) return;
      lastSent = now; lx = x; ly = y;
      send({ t: 'pos', x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
    },
  };
}
