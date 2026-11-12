// Fetch and validate level data. A level is never trusted just because it was served.
import { validateLevel } from './level.js';

export async function loadPublished() {
  const r = await fetch('levels/published.json', { cache: 'no-store' });
  if (!r.ok) throw new Error('Could not load the level list');
  return r.json();
}

export async function loadLevel(id, version) {
  if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(id)) throw new Error('Unknown level');
  if (!version) version = (await loadPublished())[id];
  if (!Number.isInteger(version)) throw new Error('Unknown level');
  const r = await fetch(`levels/${id}/v${version}.json`, { cache: 'no-store' });
  if (!r.ok) throw new Error('Level not found');
  const text = await r.text();
  const level = JSON.parse(text);
  const res = validateLevel(level, { bytes: new TextEncoder().encode(text).length });
  if (!res.ok) throw new Error(`Invalid level: ${res.errors[0]}`);
  return { level, info: res.info };
}

// "#/w/<id>@<version>" or "#/w/<id>"
export function parseWorldHash(hash) {
  const m = /^#\/w\/([a-z0-9][a-z0-9-]{1,31})(?:@(\d+))?$/.exec(hash || '');
  return m ? { id: m[1], version: m[2] ? Number(m[2]) : null } : null;
}
