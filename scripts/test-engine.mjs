#!/usr/bin/env node
// Engine acceptance harness — the balance oracle for this repo.
// Runs N seeded 5v5 matches with real generateFighter() teams, prints the
// class/species winrate + pacing tables (same shape as BALANCE-FINAL), and
// verifies determinism on every match.
//
//   node scripts/test-engine.mjs --n=20
//   node scripts/test-engine.mjs --n=600 --bands   (band assertions)

import { generateFighter } from '../src/gen/compose.mjs';
import { runMatch } from '../src/engine/index.mjs';

function parseArgs(argv) {
  const args = { n: 20, bands: false, seed: 'acceptance' };
  for (const a of argv) {
    if (a.startsWith('--n=')) args.n = parseInt(a.slice(4), 10);
    else if (a === '--bands') args.bands = true;
    else if (a.startsWith('--seed=')) args.seed = a.slice(7);
  }
  return args;
}

const { n, bands, seed } = parseArgs(process.argv.slice(2));

const classStats = {}; // cls -> { apps, wins, survived, fielded }
const speciesStats = {};
const pacing = { wipe: 0, 'timeout-downs': 0, 'timeout-dmg': 0, 'timeout-flip': 0 };
let roundsTotal = 0;
let detMismatch = 0;

const bump = (map, key, won) => {
  const s = (map[key] = map[key] ?? { apps: 0, wins: 0 });
  s.apps++;
  if (won) s.wins++;
};

const t0 = Date.now();
for (let i = 0; i < n; i++) {
  const teamA = Array.from({ length: 5 }, (_, j) => generateFighter(`${seed}-A${i}-${j}`));
  const teamB = Array.from({ length: 5 }, (_, j) => generateFighter(`${seed}-B${i}-${j}`));
  const match = await runMatch(teamA, teamB, `${seed}-match-${i}`);

  // determinism: every match re-run must be byte-identical
  const rerun = await runMatch(teamA, teamB, `${seed}-match-${i}`);
  if (JSON.stringify(match) !== JSON.stringify(rerun)) detMismatch++;

  for (const r of match.rounds) {
    pacing[r.how] = (pacing[r.how] ?? 0) + 1;
    roundsTotal++;
  }
  for (const [side, fighters] of [['A', teamA], ['B', teamB]]) {
    const won = match.winner === side;
    for (const f of fighters) {
      bump(classStats, f.cls, won);
      bump(speciesStats, f.parts.find((p) => p.slot === 'bases').id.split('/')[1], won);
    }
  }
}
const elapsed = Date.now() - t0;

const pct = (s) => ((s.wins / s.apps) * 100).toFixed(1);
const table = (map) =>
  Object.entries(map)
    .sort((a, b) => b[1].wins / b[1].apps - a[1].wins / a[1].apps)
    .map(([k, s]) => `  ${k.padEnd(20)} ${pct(s).padStart(6)}%  (${s.apps} appearances)`)
    .join('\n');

console.log(`engine acceptance — ${n} matches (${roundsTotal} rounds) in ${elapsed}ms\n`);
console.log(`determinism: ${detMismatch === 0 ? 'PASS' : `FAIL (${detMismatch} mismatches)`}\n`);
console.log('class winrates:');
console.log(table(classStats));
console.log('\nspecies winrates:');
console.log(table(speciesStats));
console.log('\npacing:');
for (const [how, count] of Object.entries(pacing)) {
  console.log(`  ${how.padEnd(15)} ${((count / roundsTotal) * 100).toFixed(1).padStart(6)}%`);
}

if (detMismatch > 0) process.exit(1);

if (bands) {
  // BALANCE-FINAL bands (generous ± for sampling noise at moderate N)
  const expect = [
    ['Tank', 48, 58],
    ['Cleric', 48, 57],
    ['Berserker', 36, 50],
  ];
  let failed = 0;
  for (const [cls, lo, hi] of expect) {
    const s = classStats[cls];
    if (!s || s.apps < 20) {
      console.log(`band skip: ${cls} (too few appearances)`);
      continue;
    }
    const wr = (s.wins / s.apps) * 100;
    const ok = wr >= lo && wr <= hi;
    console.log(`band ${ok ? 'PASS' : 'FAIL'}: ${cls} ${wr.toFixed(1)}% (want ${lo}-${hi}%)`);
    if (!ok) failed++;
  }
  for (const [sp, s] of Object.entries(speciesStats)) {
    if (s.apps < 30) continue;
    const wr = (s.wins / s.apps) * 100;
    if (wr < 40 || wr > 60) {
      console.log(`band FAIL: species ${sp} ${wr.toFixed(1)}% (want 40-60%)`);
      failed++;
    }
  }
  if (failed > 0) {
    console.log(`\n${failed} band failures`);
    process.exit(1);
  }
  console.log('\nall bands PASS');
}
