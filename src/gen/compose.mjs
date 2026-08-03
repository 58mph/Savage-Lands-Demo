// Step 2 — Generator. Pure, deterministic, no DOM.
//
// generateFighter(seed) -> { id, name, parts, stats, image, ... }
// Same seed -> identical fighter object (and byte-identical PNG via render.mjs).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// z-order for compositing; also the roll order.
export const Z_ORDER = ['bases', 'legs', 'chest', 'shoulders', 'gloves', 'weapons', 'offhands'];
export const ARMOR_SLOTS = ['chest', 'shoulders', 'gloves', 'legs'];
const OPTIONAL_SLOTS = new Set(['chest', 'shoulders', 'gloves', 'legs', 'offhands']);

// ---------------------------------------------------------------------------
// Seeded RNG: mulberry32 over a 32-bit FNV-1a hash of the seed string.

export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Data loading (cached; tests can inject their own via opts).

let cache = null;
function loadData() {
  if (!cache) {
    cache = {
      manifest: JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'attributes.json'), 'utf8')),
      tuning: JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'tuning.json'), 'utf8')),
      names: JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'names.json'), 'utf8')),
    };
  }
  return cache;
}

// ---------------------------------------------------------------------------
// Helpers

function weightedPick(rng, items, weightOf) {
  const total = items.reduce((s, it) => s + weightOf(it), 0);
  let roll = rng() * total;
  for (const it of items) {
    roll -= weightOf(it);
    if (roll < 0) return it;
  }
  return items[items.length - 1];
}

/** Uniqueness key: sha256 of the sorted part-id list. Same parts = same id. */
export function computeFighterId(partIds) {
  return crypto.createHash('sha256').update([...partIds].sort().join('\n')).digest('hex');
}

export function deriveClass(parts) {
  const bySlot = Object.fromEntries(parts.map((p) => [p.slot, p]));
  const weapon = bySlot.weapons;
  const offhand = bySlot.offhands;
  const isStaff = weapon && weapon.dmgType === 'spell';
  const isTome = offhand && (offhand.tags.includes('cleric') || /tome|book/.test(offhand.id));
  const isTowershield = offhand && (offhand.tags.includes('tank') || /tower|bulwark/.test(offhand.id));
  const noArmor = ARMOR_SLOTS.every((s) => !bySlot[s]);

  if (isTowershield) return 'Tank';
  if (isStaff && isTome) return 'Cleric';
  if (isStaff) return 'Wizard';
  if (weapon && (weapon.dmgType === 'ranged' || /bow/.test(weapon.id))) return 'Archer';
  if (noArmor) return 'Berserker';
  return 'Rogue';
}

function rollParts(rng, manifest, tuning) {
  const pool = {};
  for (const slot of Z_ORDER) {
    pool[slot] = manifest.filter((e) => e.slot === slot && !e.missing);
  }
  const parts = [];
  for (const slot of Z_ORDER) {
    const candidates = pool[slot];
    if (candidates.length === 0) {
      if (slot === 'bases' || slot === 'weapons') {
        throw new Error(`no assets available for required slot "${slot}"`);
      }
      continue;
    }
    if (OPTIONAL_SLOTS.has(slot)) {
      // EMPTY is a weighted outcome in the same roll as the pieces.
      const totalPieceWeight = candidates.reduce(
        (s, e) => s + (e.rarityWeight ?? tuning.pieceWeight),
        0
      );
      if (rng() * (totalPieceWeight + tuning.emptySlotWeight) < tuning.emptySlotWeight) {
        continue; // slot rolled EMPTY
      }
    }
    const entry = weightedPick(rng, candidates, (e) => e.rarityWeight ?? tuning.pieceWeight);
    const golden = entry.golden || rng() < tuning.goldenChance;
    parts.push({
      slot,
      id: entry.id,
      file: entry.file,
      name: entry.name,
      stats: entry.stats,
      dmgType: entry.dmgType,
      tags: entry.tags ?? [],
      golden,
      // tint only pieces whose art isn't already golden
      goldenTint: golden && !entry.golden,
    });
  }
  return parts;
}

function deriveStats(parts, tuning) {
  const stats = { hp: 0, atk: 0, def: 0, spd: 0 };
  for (const part of parts) {
    const mult = part.golden ? tuning.goldenStatMultiplier : 1;
    for (const key of Object.keys(stats)) {
      stats[key] += (part.stats?.[key] ?? 0) * mult;
    }
  }
  for (const key of Object.keys(stats)) stats[key] = Math.round(stats[key] * 100) / 100;

  const slotsPresent = new Set(parts.map((p) => p.slot));
  const gaps = ARMOR_SLOTS.filter((s) => !slotsPresent.has(s)).length;
  stats.crit = Math.round(gaps * tuning.critPerGap * 10000) / 10000;
  return { stats, gaps };
}

/**
 * Generate one fighter from a seed.
 *
 * @param {string} seed
 * @param {object} [opts]
 * @param {Set<string>} [opts.existingIds] ids already taken; the generator
 *        re-rolls until it produces a fighter whose id is not in the set.
 * @param {Array}  [opts.manifest] injectable for tests
 * @param {object} [opts.tuning]   injectable for tests
 * @param {object} [opts.names]    injectable for tests
 */
export function generateFighter(seed, opts = {}) {
  const data = loadData();
  const manifest = opts.manifest ?? data.manifest;
  const tuning = { ...data.tuning, ...(opts.tuning ?? {}) };
  const names = opts.names ?? data.names;
  const existingIds = opts.existingIds ?? new Set();

  const rng = mulberry32(fnv1a(String(seed)));

  const MAX_ATTEMPTS = 1000;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const parts = rollParts(rng, manifest, tuning);
    const id = computeFighterId(parts.map((p) => p.id));
    if (existingIds.has(id)) continue; // collision: re-roll from the same stream

    const { stats } = deriveStats(parts, tuning);
    const bySlot = Object.fromEntries(parts.map((p) => [p.slot, p]));
    const doubleAttack = !bySlot.offhands; // engine consumes this flag
    const tags = [...new Set(parts.flatMap((p) => p.tags ?? []))].sort();
    const dmgType = bySlot.weapons?.dmgType ?? 'physical';
    const dmgTypes = tags.includes('dagger-hybrid')
      ? ['physical', 'spell']
      : [dmgType];

    const first = names.first[Math.floor(rng() * names.first.length)];
    const epithet = names.epithet[Math.floor(rng() * names.epithet.length)];

    return {
      id,
      name: `${first} ${epithet}`,
      cls: deriveClass(parts),
      parts: parts.map(({ slot, id: partId, golden, goldenTint }) => ({
        slot,
        id: partId,
        golden,
        goldenTint,
      })),
      stats,
      doubleAttack,
      tags,
      dmgType,
      dmgTypes,
      seed: String(seed),
      // canonical output location — buffers are never embedded in the fighter
      image: `generated/fighters/${id}.png`,
    };
  }
  throw new Error(`could not roll a unique fighter after ${MAX_ATTEMPTS} attempts (seed=${seed})`);
}
