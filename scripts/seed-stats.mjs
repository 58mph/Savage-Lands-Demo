#!/usr/bin/env node
// One-time v1 balance pass: bakes display names and stat blocks into
// data/attributes.json. Deterministic (jitter comes from a hash of the part
// id, so re-runs produce identical numbers).
//
// SAFE RE-RUNS: only entries that are still scaffold (name "TODO" or all-zero
// stats) are filled — anything a human has already tuned is left untouched.
// Bases are seeded from the species archetype table below (Scouts like
// possums/raccoons/ratmen are fast, Brutes hit hard and slow, etc.).
//
//   node scripts/seed-stats.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fnv1a } from '../src/gen/compose-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(ROOT, 'data', 'attributes.json');

// --- Species archetypes (per sprites/DESIGN.md roles) ----------------------
const ARCHETYPES = {
  warrior: { hp: 100, atk: 15, def: 12, spd: 10 },
  shaman: { hp: 70, atk: 8, def: 6, spd: 9 },
  hunter: { hp: 80, atk: 12, def: 8, spd: 12 },
  brute: { hp: 130, atk: 18, def: 10, spd: 7 },
  scout: { hp: 60, atk: 10, def: 5, spd: 14 },
  chief: { hp: 120, atk: 14, def: 14, spd: 8 },
};
const SPECIES = {
  crocodillian: 'warrior',
  albino_crocodillian: 'shaman',
  lizardman: 'scout',
  salamander: 'brute',
  frogfolk: 'hunter',
  poisonous_frogfolk: 'shaman',
  bearkin: 'warrior',
  winter_bearkin: 'chief',
  black_ratman: 'scout',
  brown_ratman: 'hunter',
  white_ratman: 'shaman',
  minotaur: 'brute',
  possum: 'scout',
  raccoon: 'hunter',
};

// --- Item quality tiers (budget multiplier from name keywords) -------------
const TIERS = [
  [/golden|sentient|ancient|cosmic|chaos|nexus|nether|king/, 1.35],
  [/dragon|ebon|demon|frost|molten|volcanic|royal|hero|champion|conquer|fallen_kingdom|warforged|titan|bulwark/, 1.2],
  [/rusty|broken|wooden|traveler|adventurer|grey|tattered|mossy/, 0.75],
];
function tierOf(stem) {
  for (const [re, mult] of TIERS) if (re.test(stem)) return mult;
  return 1.0;
}
// deterministic 0.90..1.10 jitter so same-tier items still differ
const jitterOf = (id) => 0.9 + (fnv1a(id) % 21) / 100;

// --- Per-slot stat profiles (mid-tier baselines) ----------------------------
const LEANS = [
  // [keyword regex, stat multipliers]
  [/tanking|platemail|plate|tower|bulwark|thick|heavy|iron|steel|full_/, { def: 1.5, hp: 1.25, spd: 0.5 }],
  [/thiev|rogue|nightstalker|shadow|sneak|silk|jester|rush|swift|marksman/, { spd: 1.8, def: 0.6 }],
  [/fury|berserk|destroyer|spiked|serrated|wicked|cursed|blood|vampir|war|slayer|merciless|lethal/, { atk: 1.6 }],
  [/healer|holy|blessed|sage|hero/, { hp: 1.5 }],
  [/wizard|mage|mana|imbued|arcane|necromancer|summoner|enchanter|nethermancer|warlock|irradiated/, { atk: 1.3, spd: 1.2, def: 0.8 }],
];
function applyLeans(stem, base) {
  const out = { ...base };
  for (const [re, mults] of LEANS) {
    if (!re.test(stem)) continue;
    for (const [k, m] of Object.entries(mults)) out[k] = (out[k] ?? 0) * m;
  }
  return out;
}

function weaponBase(stem, dmgType) {
  if (/dagger|shard|sliver|fang(?!s)/.test(stem)) return { atk: 6, spd: 2 };
  if (/axe/.test(stem)) return { atk: 11, spd: -1 };
  if (/spear|lance/.test(stem)) return { atk: 8, spd: 1 };
  if (/torch/.test(stem)) return { atk: 4, spd: 0 };
  if (dmgType === 'ranged') return { atk: 7, spd: 1 };
  return { atk: 8, spd: 0 }; // swords, blades, maces
}

function offhandBase(stem) {
  if (/staff|scepter|smiter|mirror|wand/.test(stem)) return { atk: 5, spd: 1 };
  if (/tome|book/.test(stem)) return { hp: 6, atk: 2 };
  return { hp: 4, atk: 3 }; // roses, pendants, rubies, trinkets
}

function shieldBase(stem) {
  if (/tower|bulwark|slab|coffin/.test(stem)) return { hp: 14, def: 9, spd: -2 };
  if (/buckler/.test(stem)) return { hp: 4, def: 4, spd: 0 };
  return { hp: 8, def: 6, spd: -1 }; // kite, round, viking...
}

// Condition marks: small permanent quirks, some double-edged.
const CONDITIONS = [
  [/berzerker|bloodlust|enraged|fury/, { atk: 3 }],
  [/venomous/, { atk: 2, hp: -1 }],
  [/burned/, { atk: 2, hp: -4 }],
  [/nicked/, { hp: -2, atk: 1 }],
  [/scratched/, { hp: -1, atk: 1 }],
  [/slowed/, { spd: -2, def: 2 }],
  [/recovering/, { hp: 3, spd: -1 }],
  [/pain_tolerance/, { hp: 4 }],
  [/pain_is_weakness/, { atk: 2, hp: -2 }],
  [/ebon_skin/, { def: 3 }],
  [/wrapped/, { def: 2 }],
  [/blessed|holy/, { hp: 3, def: 1 }],
  [/frostrime/, { def: 2, spd: -1 }],
  [/kings_crown/, { hp: 2, atk: 2, def: 2, spd: 1 }],
  [/mark_of_the_bear/, { hp: 4 }],
  [/mark_of_the_hunter/, { atk: 2, spd: 1 }],
  [/tattoo/, { atk: 1, spd: 1 }],
];
function conditionBase(stem) {
  for (const [re, stats] of CONDITIONS) if (re.test(stem)) return stats;
  return { hp: 2 };
}

const SLOT_BASE = {
  chest: () => ({ hp: 18, def: 5 }),
  robes: () => ({ hp: 10, atk: 4, def: 2, spd: 1 }),
  shoulders: () => ({ hp: 6, def: 3 }),
  gloves: () => ({ atk: 2, def: 2, spd: 1 }),
  legs: () => ({ hp: 10, def: 3 }),
  boots: () => ({ hp: 3, def: 2, spd: 2 }),
  belts: () => ({ hp: 6, def: 2 }),
  helms: () => ({ hp: 5, def: 4 }),
  capes: () => ({ hp: 4, def: 1, spd: 1 }),
  shieldstraps: () => ({}),
};

function itemStats(entry) {
  const stem = entry.id.split('/')[1];
  let base;
  if (entry.slot === 'weapons') base = weaponBase(stem, entry.dmgType);
  else if (entry.slot === 'offhands') base = offhandBase(stem);
  else if (entry.slot === 'shields') base = shieldBase(stem);
  else if (entry.slot === 'conditions') base = conditionBase(stem);
  else base = (SLOT_BASE[entry.slot] ?? (() => ({})))();

  const leaned = entry.slot === 'conditions' ? base : applyLeans(stem, base);
  const scale = entry.slot === 'conditions' ? 1 : tierOf(stem) * jitterOf(entry.id);

  const stats = { hp: 0, atk: 0, def: 0, spd: 0 };
  for (const key of Object.keys(stats)) {
    const raw = (leaned[key] ?? 0) * scale;
    // round away from zero so ±1-point flavor stats survive
    stats[key] = raw >= 0 ? Math.round(raw) : -Math.round(-raw);
  }
  return stats;
}

function displayName(id) {
  return id
    .split('/')[1]
    .split('_')
    .map((w) => (/^\d/.test(w) ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ')
    .replace(/\b(Of|The|Le)\b/g, (m) => m.toLowerCase());
}

// ---------------------------------------------------------------------------
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const isZero = (s) => ['hp', 'atk', 'def', 'spd'].every((k) => !(s?.[k] ?? 0));
const BASE_SCAFFOLD = JSON.stringify({ hp: 80, atk: 10, def: 8, spd: 10 });

let namesFilled = 0;
let statsFilled = 0;
for (const entry of manifest) {
  if (entry.name === 'TODO') {
    entry.name = displayName(entry.id);
    namesFilled++;
  }
  if (entry.slot === 'bases') {
    // scaffold blocks (uniform 80/10/8/10) are ours to replace; tuned ones stay
    if (JSON.stringify(entry.stats) === BASE_SCAFFOLD || isZero(entry.stats)) {
      const stem = entry.id.split('/')[1];
      const role = SPECIES[stem];
      const arch = ARCHETYPES[role] ?? ARCHETYPES.hunter;
      entry.stats = { ...arch };
      entry.tags = [...new Set([...(entry.tags ?? []), role ?? 'hunter'])];
      statsFilled++;
    }
  } else if (isZero(entry.stats)) {
    entry.stats = itemStats(entry);
    statsFilled++;
  }
}

fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
console.log(`seed-stats: ${namesFilled} names filled, ${statsFilled} stat blocks baked (${manifest.length} entries total)`);
