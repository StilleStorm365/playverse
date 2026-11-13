#!/usr/bin/env node
// Writes a dated copy of the live database to backups/ (git-ignored).
// Usage: npm run backup          the published database
//        npm run backup -- local the one on this machine
// The scores and the community portals only exist in D1: if it were lost, so are they.
import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const local = process.argv.includes('local');
const dir = 'backups';
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/:/g, '-').slice(0, 16);
const out = join(dir, `playverse-${local ? 'local' : 'remote'}-${stamp}.sql`);

const args = ['d1', 'export', 'playverse', local ? '--local' : '--remote', '--output', out];
console.log(`$ wrangler ${args.join(' ')}`);
// Wrangler's own entry point with this Node: no shell, no .cmd lookup, same on every platform.
const cli = join('node_modules', 'wrangler', 'bin', 'wrangler.js');
const r = spawnSync(process.execPath, [cli, ...args], { stdio: 'inherit' });
if (r.error || r.status !== 0) {
  console.error(`\nBackup failed${r.error ? `: ${r.error.message}` : ''}.`);
  if (local) console.error('For the local database, run npm run dev once first so it exists.');
  process.exit(r.status ?? 1);
}
console.log(`\nSaved ${out}. Keep a copy somewhere else as well; backups/ is not in git.`);
