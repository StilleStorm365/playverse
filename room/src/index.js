// Presence for the hub: who is in Nexus Plaza and where they stand, plus the duo Vibe Jam portal.
// Uses the WebSocket Hibernation API, so an idle room costs nothing. All client input is untrusted.
//
// Client -> server: {t:'hi', nick, x, y} once, then {t:'pos', x, y}, {t:'nick', nick},
//                   {t:'emote', e: 0..EMOTES-1} (max 1/s), {t:'jam'} / {t:'unjam'} (enter / leave the Vibe Jam portal queue), {t:'portals'} (list changed).
// Server -> client: {t:'welcome', id, players, party}, {t:'join'|'pos'|'nick'|'leave', ...},
//                   {t:'emote', id, e}, {t:'party', ids, endsAt}, {t:'go', mode:'duo'|'solo', seed, with}, {t:'portals'}.
// Duo: the first player to enter opens a PARTY_MS window; whoever else enters joins. When it closes,
// 2+ players get the same random seed and pick the same multiplayer game from the shared list.
import { DurableObject } from 'cloudflare:workers';
import { NICK_RE, blocked } from '../../public/js/community.js';

const MAX_PLAYERS = 40;
const PARTY_MS = 4000;
const MAX_MSG = 300;
const MSG_PER_SEC = 25;
const EMOTES = 4;

const num = (v) => (Number.isFinite(v) ? Math.round(Math.max(0, Math.min(64, v)) * 100) / 100 : 0);
const cleanNick = (n) => {
  const s = typeof n === 'string' ? n.trim() : '';
  return NICK_RE.test(s) && !blocked(s) ? s : 'guest';
};
const pub = (a) => ({ id: a.id, nick: a.nick, x: a.x, y: a.y });

export class Room extends DurableObject {
  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    if (this.ctx.getWebSockets().length >= MAX_PLAYERS) return new Response('Nexus Plaza is full', { status: 503 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: crypto.randomUUID().slice(0, 8), nick: null, x: 0, y: 0, win: 0, n: 0 });
    return new Response(null, { status: 101, webSocket: client });
  }

  sockets() { return this.ctx.getWebSockets().map((ws) => ({ ws, a: ws.deserializeAttachment() })); }
  send(ws, m) { try { ws.send(JSON.stringify(m)); } catch { /* gone */ } }
  broadcast(m, except) {
    const s = JSON.stringify(m);
    for (const ws of this.ctx.getWebSockets()) if (ws !== except) { try { ws.send(s); } catch { /* gone */ } }
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > MAX_MSG) return;
    const a = ws.deserializeAttachment();
    const now = Date.now();
    if (now - a.win > 1000) { a.win = now; a.n = 0; }
    a.n++;
    let m;
    try { m = JSON.parse(raw); } catch { m = null; }
    if (a.n > MSG_PER_SEC || !m || typeof m !== 'object') { ws.serializeAttachment(a); return; }

    if (m.t === 'hi' && !a.nick) {
      a.nick = cleanNick(m.nick); a.x = num(m.x); a.y = num(m.y);
      ws.serializeAttachment(a);
      const players = this.sockets().filter((p) => p.ws !== ws && p.a.nick).map((p) => pub(p.a));
      this.send(ws, { t: 'welcome', id: a.id, players, party: await this.partyInfo() });
      this.broadcast({ t: 'join', ...pub(a) }, ws);
      return;
    }
    if (!a.nick) { ws.serializeAttachment(a); return; }
    if (m.t === 'pos') {
      a.x = num(m.x); a.y = num(m.y);
      ws.serializeAttachment(a);
      this.broadcast({ t: 'pos', id: a.id, x: a.x, y: a.y }, ws);
      return;
    }
    if (m.t === 'nick') { a.nick = cleanNick(m.nick); ws.serializeAttachment(a); this.broadcast({ t: 'nick', id: a.id, nick: a.nick }); return; }
    if (m.t === 'emote') {
      if (Number.isInteger(m.e) && m.e >= 0 && m.e < EMOTES && now - (a.em || 0) >= 1000) { a.em = now; this.broadcast({ t: 'emote', id: a.id, e: m.e }); }
      ws.serializeAttachment(a);
      return;
    }
    ws.serializeAttachment(a);
    if (m.t === 'jam') await this.joinParty(a.id);
    else if (m.t === 'unjam') await this.leaveParty(a.id);
    else if (m.t === 'portals') this.broadcast({ t: 'portals' }, ws);
  }

  async webSocketClose(ws, code) {
    const a = ws.deserializeAttachment();
    try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch { /* already closed */ }
    if (a?.nick) this.broadcast({ t: 'leave', id: a.id }, ws);
    if (a) await this.leaveParty(a.id);
  }
  async webSocketError(ws) { await this.webSocketClose(ws, 1011); }

  async partyInfo() {
    const p = await this.ctx.storage.get('party');
    return p && p.endsAt > Date.now() ? p : { ids: [], endsAt: 0 };
  }
  async joinParty(id) {
    let p = await this.ctx.storage.get('party');
    if (!p || p.endsAt <= Date.now()) {
      p = { ids: [], endsAt: Date.now() + PARTY_MS };
      await this.ctx.storage.setAlarm(p.endsAt);
    }
    if (!p.ids.includes(id)) p.ids.push(id);
    await this.ctx.storage.put('party', p);
    this.broadcast({ t: 'party', ...p });
  }
  async leaveParty(id) {
    const p = await this.ctx.storage.get('party');
    if (!p || !p.ids.includes(id)) return;
    p.ids = p.ids.filter((x) => x !== id);
    if (p.ids.length) await this.ctx.storage.put('party', p);
    else { await this.ctx.storage.delete('party'); await this.ctx.storage.deleteAlarm(); }
    this.broadcast({ t: 'party', ...(p.ids.length ? p : { ids: [], endsAt: 0 }) });
  }
  async alarm() {
    const p = await this.ctx.storage.get('party');
    await this.ctx.storage.delete('party');
    if (!p) return;
    const members = this.sockets().filter((s) => s.a.nick && p.ids.includes(s.a.id));
    const duo = members.length >= 2;
    const seed = Math.random();
    const names = members.map((s) => s.a.nick);
    for (const s of members) this.send(s.ws, { t: 'go', mode: duo ? 'duo' : 'solo', seed, with: names.filter((n) => n !== s.a.nick) });
    this.broadcast({ t: 'party', ids: [], endsAt: 0 });
  }
}

export default {
  fetch() { return new Response('Not found', { status: 404 }); },
};
