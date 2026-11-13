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
  MAX_PLAYERS, MAX_MSG, EMOTE_GAP_MS, CLOSE_FULL, CLOSE_IDLE,
  clampCoord, cleanNick, publicPlayer, countMessage, validEmote, partyJoin, partyLeave, goMessages,
  isIdle, nextAlarm, snapshot, flushIn,
} from './protocol.js';

const EMPTY_PARTY = { ids: [], endsAt: 0 };

export class Room extends DurableObject {
  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      if (new URL(request.url).searchParams.get('count') === '1') {
        const players = this.live().filter((s) => s.a.nick).length;
        const [lastSweep, sweeps] = await Promise.all([this.ctx.storage.get('lastSweep'), this.ctx.storage.get('sweeps')]);
        return Response.json({ players, max: MAX_PLAYERS, sockets: this.ctx.getWebSockets().length, lastSweep: lastSweep ?? null, sweeps: sweeps ?? 0 });
      }
      return new Response('Expected a WebSocket', { status: 426 });
    }
    const [client, server] = Object.values(new WebSocketPair());
    if (this.live().length >= MAX_PLAYERS) {
      // Accept, then close with our own code: a failed handshake tells the browser nothing.
      server.accept();
      server.close(CLOSE_FULL, 'full');
      return new Response(null, { status: 101, webSocket: client });
    }
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: crypto.randomUUID().slice(0, 8), nick: null, x: 0, y: 0, win: 0, n: 0, seen: Date.now() });
    this.ctx.waitUntil(this.rescheduleAlarm());
    return new Response(null, { status: 101, webSocket: client });
  }

  // Positions waiting to go out in the next snapshot (see protocol.js), and when the last one went.
  pending = new Map();
  lastFlush = 0;
  flushTimer = null;

  sockets() { return this.ctx.getWebSockets().map((ws) => ({ ws, a: ws.deserializeAttachment() || {} })); }
  /**
   * Connections we still count on. A swept connection is marked `gone` rather than trusted to
   * disappear: closing a socket whose other end is already unreachable does not always take it off
   * the list, and a ghost that keeps being counted would eventually fill the plaza.
   */
  live() { return this.sockets().filter((s) => !s.a.gone); }

  /** Sends the collected positions as one message per client, at most every SNAPSHOT_MS. */
  flush() {
    this.flushTimer = null;
    const p = snapshot(this.pending);
    this.pending.clear();
    this.lastFlush = Date.now();
    if (p) this.broadcast({ t: 'snap', p });
  }
  queueFlush() {
    if (this.flushTimer) return;
    const wait = flushIn(this.lastFlush, Date.now());
    if (!wait) { this.flush(); return; }
    // waitUntil keeps the room awake for the few milliseconds until the snapshot goes out.
    this.ctx.waitUntil(new Promise((done) => {
      this.flushTimer = setTimeout(() => { this.flush(); done(); }, wait);
    }));
  }
  send(ws, m) { try { ws.send(JSON.stringify(m)); } catch { /* gone */ } }
  broadcast(m, except) {
    const s = JSON.stringify(m);
    for (const { ws } of this.live()) if (ws !== except) { try { ws.send(s); } catch { /* gone */ } }
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > MAX_MSG) return;
    const a = ws.deserializeAttachment();
    const now = Date.now();
    a.seen = now;
    const within = countMessage(a, now);
    let m;
    try { m = JSON.parse(raw); } catch { m = null; }
    if (!within || !m || typeof m !== 'object') { ws.serializeAttachment(a); return; }

    if (m.t === 'hi' && !a.nick) {
      a.nick = cleanNick(m.nick); a.x = clampCoord(m.x); a.y = clampCoord(m.y);
      ws.serializeAttachment(a);
      const players = this.live().filter((p) => p.ws !== ws && p.a.nick).map((p) => publicPlayer(p.a));
      this.send(ws, { t: 'welcome', id: a.id, players, party: await this.partyInfo() });
      this.broadcast({ t: 'join', ...publicPlayer(a) }, ws);
      return;
    }
    if (!a.nick) { ws.serializeAttachment(a); return; }
    if (m.t === 'pos') {
      a.x = clampCoord(m.x); a.y = clampCoord(m.y);
      ws.serializeAttachment(a);
      this.pending.set(a.id, { x: a.x, y: a.y });
      this.queueFlush();
      return;
    }
    if (m.t === 'nick') { a.nick = cleanNick(m.nick); ws.serializeAttachment(a); this.broadcast({ t: 'nick', id: a.id, nick: a.nick }); return; }
    if (m.t === 'emote') {
      if (validEmote(m.e) && now - (a.em || 0) >= EMOTE_GAP_MS) { a.em = now; this.broadcast({ t: 'emote', id: a.id, e: m.e }); }
      ws.serializeAttachment(a);
      return;
    }
    ws.serializeAttachment(a);
    if (m.t === 'ping') return;            // "I am still here", from a visible tab
    if (m.t === 'jam') await this.joinParty(a.id);
    else if (m.t === 'unjam') await this.leaveParty(a.id);
    else if (m.t === 'portals') this.broadcast({ t: 'portals' }, ws);
  }

  async webSocketClose(ws, code) {
    const a = ws.deserializeAttachment();
    if (a) this.pending.delete(a.id);
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
    if (party.endsAt !== before?.endsAt) await this.ctx.storage.setAlarm(party.endsAt);   // earlier than any sweep
    await this.ctx.storage.put('party', party);
    this.broadcast({ t: 'party', ...party });
  }
  async leaveParty(id) {
    const before = await this.ctx.storage.get('party');
    const party = partyLeave(before, id);
    if (party === before) return;
    if (party) await this.ctx.storage.put('party', party);
    else { await this.ctx.storage.delete('party'); await this.rescheduleAlarm(); }
    this.broadcast({ t: 'party', ...(party || EMPTY_PARTY) });
  }
  /** Gives up on connections we have not heard from in a long time, so ghosts do not hold a place. */
  sweep(now) {
    let swept = 0;
    for (const { ws, a } of this.live()) {
      if (!isIdle(a, now)) continue;
      swept++;
      a.gone = true;
      try { ws.serializeAttachment(a); } catch { /* already gone */ }
      try { ws.close(CLOSE_IDLE, 'idle'); } catch { /* already gone */ }
      if (a.nick) this.broadcast({ t: 'leave', id: a.id }, ws);
    }
    return swept;
  }

  async rescheduleAlarm() {
    const now = Date.now();
    const party = await this.ctx.storage.get('party');
    const at = nextAlarm(party, this.live().length, now);
    if (at) await this.ctx.storage.setAlarm(at);
  }

  async alarm() {
    const now = Date.now();
    const party = await this.ctx.storage.get('party');
    if (party && party.endsAt <= now) {
      await this.ctx.storage.delete('party');
      const members = this.sockets().filter((s) => s.a.nick && party.ids.includes(s.a.id));
      const byId = new Map(members.map((s) => [s.a.id, s.ws]));
      for (const { id, msg } of goMessages(members.map((s) => ({ id: s.a.id, nick: s.a.nick })), Math.random())) {
        this.send(byId.get(id), msg);
      }
      this.broadcast({ t: 'party', ...EMPTY_PARTY });
    }
    const swept = this.sweep(now);
    await this.ctx.storage.put({ lastSweep: now, sweeps: ((await this.ctx.storage.get('sweeps')) ?? 0) + 1, lastSwept: swept });
    await this.rescheduleAlarm();
  }
}

export default {
  fetch() { return new Response('Not found', { status: 404 }); },
};
