// Presence for the hub: who is in Nexus Plaza and where they stand, plus the duo Vibe Jam portal.
// Uses the WebSocket Hibernation API, so an idle room costs nothing. All client input is untrusted;
// the rules live in protocol.js, which the unit tests cover.
//
// Client -> server: {t:'hi', nick, x, y} once, then {t:'pos', x, y}, {t:'nick', nick},
//                   {t:'emote', e: 0..EMOTES-1} (max 1/s), {t:'jam'} / {t:'unjam'} (enter / leave the Vibe Jam portal queue), {t:'portals'} (list changed).
// Server -> client: {t:'welcome', id, players, party}, {t:'join'|'pos'|'nick'|'leave', ...},
//                   {t:'emote', id, e}, {t:'party', ids, endsAt}, {t:'go', mode:'duo'|'solo', seed, with}, {t:'portals'}.
// Duo: the first player to enter opens a PARTY_MS window; whoever else enters joins. When it closes,
// 2+ players get the same random seed and pick the same multiplayer game from the shared list.
// A full plaza is closed with CLOSE_FULL, so the client can say so instead of retrying silently.
import { DurableObject } from 'cloudflare:workers';
import {
  MAX_PLAYERS, MAX_MSG, EMOTE_GAP_MS, CLOSE_FULL,
  clampCoord, cleanNick, publicPlayer, countMessage, validEmote, partyJoin, partyLeave, goMessages,
} from './protocol.js';

const EMPTY_PARTY = { ids: [], endsAt: 0 };

export class Room extends DurableObject {
  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    if (this.ctx.getWebSockets().length >= MAX_PLAYERS) {
      // Accept, then close with our own code: a failed handshake tells the browser nothing.
      server.accept();
      server.close(CLOSE_FULL, 'full');
      return new Response(null, { status: 101, webSocket: client });
    }
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
    const within = countMessage(a, now);
    let m;
    try { m = JSON.parse(raw); } catch { m = null; }
    if (!within || !m || typeof m !== 'object') { ws.serializeAttachment(a); return; }

    if (m.t === 'hi' && !a.nick) {
      a.nick = cleanNick(m.nick); a.x = clampCoord(m.x); a.y = clampCoord(m.y);
      ws.serializeAttachment(a);
      const players = this.sockets().filter((p) => p.ws !== ws && p.a.nick).map((p) => publicPlayer(p.a));
      this.send(ws, { t: 'welcome', id: a.id, players, party: await this.partyInfo() });
      this.broadcast({ t: 'join', ...publicPlayer(a) }, ws);
      return;
    }
    if (!a.nick) { ws.serializeAttachment(a); return; }
    if (m.t === 'pos') {
      a.x = clampCoord(m.x); a.y = clampCoord(m.y);
      ws.serializeAttachment(a);
      this.broadcast({ t: 'pos', id: a.id, x: a.x, y: a.y }, ws);
      return;
    }
    if (m.t === 'nick') { a.nick = cleanNick(m.nick); ws.serializeAttachment(a); this.broadcast({ t: 'nick', id: a.id, nick: a.nick }); return; }
    if (m.t === 'emote') {
      if (validEmote(m.e) && now - (a.em || 0) >= EMOTE_GAP_MS) { a.em = now; this.broadcast({ t: 'emote', id: a.id, e: m.e }); }
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
    return p && p.endsAt > Date.now() ? p : EMPTY_PARTY;
  }
  async joinParty(id) {
    const now = Date.now();
    const before = await this.ctx.storage.get('party');
    const party = partyJoin(before, id, now);
    if (party.endsAt !== before?.endsAt) await this.ctx.storage.setAlarm(party.endsAt);
    await this.ctx.storage.put('party', party);
    this.broadcast({ t: 'party', ...party });
  }
  async leaveParty(id) {
    const before = await this.ctx.storage.get('party');
    const party = partyLeave(before, id);
    if (party === before) return;
    if (party) await this.ctx.storage.put('party', party);
    else { await this.ctx.storage.delete('party'); await this.ctx.storage.deleteAlarm(); }
    this.broadcast({ t: 'party', ...(party || EMPTY_PARTY) });
  }
  async alarm() {
    const party = await this.ctx.storage.get('party');
    await this.ctx.storage.delete('party');
    if (!party) return;
    const members = this.sockets().filter((s) => s.a.nick && party.ids.includes(s.a.id));
    const byId = new Map(members.map((s) => [s.a.id, s.ws]));
    for (const { id, msg } of goMessages(members.map((s) => ({ id: s.a.id, nick: s.a.nick })), Math.random())) {
      this.send(byId.get(id), msg);
    }
    this.broadcast({ t: 'party', ...EMPTY_PARTY });
  }
}

export default {
  fetch() { return new Response('Not found', { status: 404 }); },
};
