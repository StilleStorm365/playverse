#!/usr/bin/env node
// Validates every level file and levels/published.json.
// Usage: node tools/validate.mjs [--base <git-ref>]
//   --base: also fail if an existing levels/<id>/v<n>.json differs from <git-ref>
//           (published versions are immutable; add a new version instead).
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { validateLevel } from '../public/js/level.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const levelsDir = join(root, 'public', 'levels');
const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const base = baseIdx >= 0 ? args[baseIdx + 1] : null;

const problems = [];
const known = new Map(); // id -> Set(version)
const types = new Map(); // "id@version" -> "race" | "hub"
const hubs = [];
let count = 0;

for (const id of readdirSync(levelsDir)) {
  const dir = join(levelsDir, id);
  if (!statSync(dir).isDirectory()) continue;
  for (const file of readdirSync(dir)) {
    const rel = `public/levels/${id}/${file}`;
    const m = /^v(\d+)\.json$/.exec(file);
    if (!m) { problems.push(`${rel}: only v<n>.json files are allowed in a level folder`); continue; }
    const raw = readFileSync(join(dir, file));
    let obj;
    try { obj = JSON.parse(raw.toString('utf8')); } catch (e) { problems.push(`${rel}: invalid JSON (${e.message})`); continue; }
    const res = validateLevel(obj, { bytes: raw.length });
    res.errors.forEach((e) => problems.push(`${rel}: ${e}`));
    if (obj.id !== id) problems.push(`${rel}: id "${obj.id}" must match folder "${id}"`);
    if (obj.version !== Number(m[1])) problems.push(`${rel}: version ${obj.version} must match file name v${m[1]}`);
    if (!known.has(id)) known.set(id, new Set());
    known.get(id).add(Number(m[1]));
    types.set(`${id}@${m[1]}`, res.info.type);
    if (res.ok && res.info.type === 'hub') hubs.push({ rel, id, version: Number(m[1]), portals: obj.portals });
    count++;
    if (res.ok) console.log(`ok  ${rel}  ${res.info.type} ${res.info.width}x${res.info.height}, stars ${res.info.stars}, minTime ${res.info.minTimeMs} ms`);
  }
}

const pubPath = join(levelsDir, 'published.json');
if (!existsSync(pubPath)) problems.push('public/levels/published.json is missing');
else {
  let pub;
  try { pub = JSON.parse(readFileSync(pubPath, 'utf8')); } catch (e) { problems.push(`public/levels/published.json: invalid JSON (${e.message})`); }
  if (pub) for (const [id, v] of Object.entries(pub)) {
    if (!known.get(id)?.has(v)) problems.push(`public/levels/published.json: ${id} points to v${v}, which does not exist`);
  }
  // Published hubs may only link to published race levels.
  if (pub) for (const h of hubs) {
    if (pub[h.id] !== h.version) continue;
    for (const p of h.portals.filter((q) => q.levelId)) {
      if (!(p.levelId in pub)) problems.push(`${h.rel}: portal to "${p.levelId}", which is not published`);
      else if (types.get(`${p.levelId}@${pub[p.levelId]}`) !== 'race') problems.push(`${h.rel}: portal to "${p.levelId}", which is not a race level`);
    }
  }
}

if (base) {
  const out = execFileSync('git', ['diff', '--name-status', base, '--', 'public/levels/'], { cwd: root, encoding: 'utf8' });
  for (const line of out.split('\n').filter(Boolean)) {
    const [status, path] = line.split('\t');
    if (/^public\/levels\/[^/]+\/v\d+\.json$/.test(path) && status !== 'A') {
      problems.push(`${path}: published versions are immutable (status ${status} vs ${base}); add a new version instead`);
    }
  }
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  problems.forEach((p) => console.error(`  - ${p}`));
  process.exit(1);
}
console.log(`\n${count} level file(s) valid.`);
