#!/usr/bin/env node
// Stat spread report — reporting only, never modifies stats.
// The human tunes data/attributes.json and re-runs this to see the spread.
//
//   node scripts/stat-spread.mjs --seed audit --count 200

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateFighter, fnv1a } from '../src/gen/compose.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = { seed: 'audit', count: 200 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--seed') args.seed = argv[++i];
    else if (argv[i] === '--count') args.count = parseInt(argv[++i], 10);
  }
  return args;
}

const { seed, count } = parseArgs(process.argv.slice(2));
const STATS = ['hp', 'atk', 'def', 'spd', 'crit'];

const existingIds = new Set();
const fighters = [];
for (let i = 0; i < count; i++) {
  const derivedSeed = fnv1a(seed + i).toString(16).padStart(8, '0');
  const f = generateFighter(derivedSeed, { existingIds });
  existingIds.add(f.id);
  fighters.push(f);
}

console.log(`stat spread — seed "${seed}", ${count} fighters\n`);
console.log('stat        min        max       mean     stddev');
for (const key of STATS) {
  const vals = fighters.map((f) => f.stats[key] ?? 0);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
  console.log(
    `${key.padEnd(6)} ${min.toFixed(2).padStart(9)} ${max.toFixed(2).padStart(10)}` +
      ` ${mean.toFixed(2).padStart(10)} ${std.toFixed(2).padStart(10)}`
  );
}

function topBy(key, n = 5) {
  return [...fighters].sort((a, b) => (b.stats[key] ?? 0) - (a.stats[key] ?? 0)).slice(0, n);
}
for (const key of ['atk', 'def']) {
  console.log(`\ntop 5 by ${key.toUpperCase()}:`);
  for (const f of topBy(key)) {
    console.log(`  ${String(f.stats[key]).padStart(6)}  ${f.name} (${f.cls}, seed ${f.seed})`);
    const shown = f.parts.filter((p) => p.slot !== 'shieldstraps'); // strap = part of the shield
    console.log(`          ${shown.map((p) => p.id + (p.golden ? '★' : '')).join(', ')}`);
  }
}

// Per-slot contribution ranges straight from the manifest, so flat slots are
// immediately visible.
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'attributes.json'), 'utf8'));
const bySlot = {};
for (const e of manifest) {
  if (e.missing) continue;
  (bySlot[e.slot] = bySlot[e.slot] ?? []).push(e);
}
console.log('\nper-slot stat contribution ranges (from manifest):');
for (const [slot, entries] of Object.entries(bySlot)) {
  const ranges = ['hp', 'atk', 'def', 'spd']
    .map((k) => {
      const vals = entries.map((e) => e.stats?.[k] ?? 0);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      return `${k.toUpperCase()} ${min}..${max}`;
    })
    .join('  ');
  const flat = entries.every((e) => ['hp', 'atk', 'def', 'spd'].every((k) => !(e.stats?.[k] ?? 0)));
  console.log(`  ${slot.padEnd(13)} ${ranges}${flat ? '   <- FLAT (all zero, needs human stats)' : ''}`);
}
