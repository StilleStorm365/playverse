// Cloudflare Pages Function: GET /api/room (WebSocket) -> the hub's presence Durable Object
// (Worker "playverse-room", see room/). Same-origin only.
export async function onRequestGet({ request, env }) {
  if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
  if (!env.ROOM) return new Response('Multiplayer is not available here', { status: 503 });
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return new Response('Forbidden', { status: 403 });
  return env.ROOM.get(env.ROOM.idFromName('nexus')).fetch(request);
}
