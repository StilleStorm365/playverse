// Per-viewer conveniences in localStorage. Every access is guarded: storage may be unavailable.
const KEY = 'playverse:v1';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

export function getBest(levelId, version) { return load().best?.[`${levelId}@${version}`] ?? null; }
export function setBest(levelId, version, result) {
  const d = load(); d.best ??= {};
  const k = `${levelId}@${version}`, prev = d.best[k];
  if (!prev || result.timeMs < prev.timeMs) { d.best[k] = result; save(d); return true; }
  return false;
}
export function getNickname() { return load().nickname ?? ''; }
export function setNickname(n) { const d = load(); d.nickname = n; save(d); }
export function getHubSpot() { return load().hubSpot ?? null; }
export function setHubSpot(spot) { const d = load(); d.hubSpot = spot; save(d); }
export function getGhostsOn() { return load().ghosts ?? true; }
export function setGhostsOn(on) { const d = load(); d.ghosts = on; save(d); }
// Random token that proves "I built this portal" (only its hash is stored on the server).
export function getOwnerToken() {
  const d = load();
  if (!d.owner) {
    const b = new Uint8Array(24); crypto.getRandomValues(b);
    d.owner = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    save(d);
  }
  return d.owner;
}
export function getMine() { return load().mine ?? []; }
export function addMine(id) { const d = load(); d.mine = [...(d.mine ?? []), id].slice(-50); save(d); }
