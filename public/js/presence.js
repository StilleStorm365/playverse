// Hub presence client: a WebSocket to /api/room. Other players are kept in `peers` and drawn
// with a little smoothing. Reconnects with backoff; if the room is unavailable the hub still works solo.
export function connectPresence({ nick, pos, onEvent }) {
  const peers = new Map();
  const self = { emote: null, emoteAt: 0 };   // our own emote, echoed back by the server
  let ws = null, id = null, retry = 1000, lastSent = 0, lx = null, ly = null;
  const send = (m) => { if (ws?.readyState === 1) ws.send(JSON.stringify(m)); };

  function open() {
    try { ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/room`); } catch { return; }
    ws.onopen = () => { retry = 1000; const p = pos(); lx = p.x; ly = p.y; send({ t: 'hi', nick: nick(), x: p.x, y: p.y }); };
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
    ws.onclose = () => {
      const was = id !== null; id = null; peers.clear();
      if (was) onEvent({ t: 'offline' });
      setTimeout(open, retry); retry = Math.min(retry * 2, 20000);
    };
  }
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
