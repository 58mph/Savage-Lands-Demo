#!/usr/bin/env node
// Distribution audit — reporting only, changes nothing.
//
//   node scripts/audit-distribution.mjs --seed audit --count 200
//
// Generates N fighters from derived seeds and prints: how often each
// optional slot rolls EMPTY, doubleAttack count, class counts, golden pieces.

import { generateFighter, fnv1a, OPTIONAL_SLOTS } from '../src/gen/compose.mjs';

function parseArgs(argv) {
  const args = { seed: 'audit', count: 200 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--seed') args.seed = argv[++i];
    else if (argv[i] === '--count') args.count = parseInt(argv[++i], 10);
  }
  return args;
}

const { seed, count } = parseArgs(process.argv.slice(2));

const AUDITED_SLOTS = [...OPTIONAL_SLOTS, 'offhand'];
const empty = Object.fromEntries(AUDITED_SLOTS.map((s) => [s, 0]));
const classes = {};
let doubleAttack = 0;
let goldenPieces = 0;

const existingIds = new Set();
for (let i = 0; i < count; i++) {
  const derivedSeed = fnv1a(seed + i).toString(16).padStart(8, '0');
  const f = generateFighter(derivedSeed, { existingIds });
  existingIds.add(f.id);

  const present = new Set(f.parts.map((p) => p.slot));
  for (const slot of OPTIONAL_SLOTS) if (!present.has(slot)) empty[slot]++;
  // "offhand" empty = neither a held item nor a shield
  if (!present.has('offhands') && !present.has('shields')) empty.offhand++;

  if (f.doubleAttack) doubleAttack++;
  classes[f.cls] = (classes[f.cls] ?? 0) + 1;
  goldenPieces += f.parts.filter((p) => p.golden).length;
}

const pct = (n) => `${((n / count) * 100).toFixed(1)}%`.padStart(6);
const row = (label, n) => console.log(`  ${label.padEnd(12)} ${String(n).padStart(5)}  ${pct(n)}`);

console.log(`distribution audit — seed "${seed}", ${count} fighters\n`);
console.log('slot EMPTY counts:');
for (const slot of AUDITED_SLOTS) row(slot, empty[slot]);
console.log('\ndoubleAttack (bare off-hand):');
row('doubleAttack', doubleAttack);
console.log('\nclasses:');
for (const [cls, n] of Object.entries(classes).sort((a, b) => b[1] - a[1])) row(cls, n);
console.log(`\ngolden pieces total: ${goldenPieces} (${(goldenPieces / count).toFixed(2)} per fighter)`);
