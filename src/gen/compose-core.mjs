// Pure generator core — no Node imports, runs in Node AND the browser.
// The Node entry point (compose.mjs) wraps this with filesystem data loading;
// the static browser demo injects fetched JSON instead. Logic lives here
// exactly once so the two can never drift.

import { sha256Hex } from './sha256.mjs';

// Default z-index per slot (higher = closer to the viewer), matching the
// original Chimera template (front -> back there: Sword, Shoulder, Helm,
// Off Hand, Belt, ShieldStrap, Gloves, Robes, Boots, Chest, Pant, Condition,
// Base, Shield, Capes). Note the shield is held in the far hand so it renders
// BEHIND the base, while its strap renders in front of the body.
// Individual manifest entries may override with their own `zIndex`.
export const SLOT_Z_INDEX = {
  capes: 0,
  shields: 5,
  bases: 10,
  conditions: 20,
  legs: 30,
  chest: 40,
  boots: 50,
  robes: 60,
  gloves: 70,
  shieldstraps: 80,
  belts: 90,
  offhands: 100,
  helms: 110,
  shoulders: 120,
  weapons: 130,
};

// Slot list in default paint order, back -> front (kept for iteration).
export const Z_ORDER = Object.keys(SLOT_Z_INDEX).sort(
  (a, b) => SLOT_Z_INDEX[a] - SLOT_Z_INDEX[b]
);

// Always present on every fighter (belts too, unless a robe replaces them).
export const REQUIRED_SLOTS = ['bases', 'belts', 'boots', 'weapons'];
// Independently rolled, may be EMPTY (weighted per slot in tuning).
export const OPTIONAL_SLOTS = ['legs', 'chest', 'shoulders', 'gloves', 'helms', 'capes', 'robes', 'conditions'];
// Armor gaps that grant crit (max 4 -> +8% with defaults).
export const ARMOR_SLOTS = ['chest', 'shoulders', 'gloves', 'legs'];
// A robe replaces these slots entirely: robed fighters wear no belt, no
// shoulders, no pants, no chest (boots and gloves are still allowed). The
// robe also counts as covering chest/shoulders/legs for crit-gap and
// Berserker purposes — otherwise every robed caster would be a crit machine.
export const ROBE_REPLACES = ['belts', 'chest', 'shoulders', 'legs'];

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
  return sha256Hex([...partIds].sort().join('\n'));
}

// Precedence, first match wins:
//   towershield -> Tank
//   tome offhand -> Cleric
//   staff offhand + robe -> Wizard (full caster)
//   staff offhand + armor -> Battlemage (melee weapon + caster off-hand hybrid)
//   bow/ranged weapon -> Archer
//   any other shield -> Knight
//   zero armor pieces -> Berserker
//   else -> Rogue
// Class is a derived label only — never part of the sha256 id or the image.
export function deriveClass(parts) {
  const bySlot = Object.fromEntries(parts.map((p) => [p.slot, p]));
  const shield = bySlot.shields;
  const offhand = bySlot.offhands;
  const weapon = bySlot.weapons;
  const noArmor = ARMOR_SLOTS.every((s) => !bySlot[s]) && !bySlot.robes;
  const hasTag = (p, t) => p && (p.tags ?? []).includes(t);

  if (shield && (hasTag(shield, 'tank') || /tower|bulwark/.test(shield.id))) return 'Tank';
  if (offhand && (hasTag(offhand, 'cleric') || /tome|book/.test(offhand.id))) return 'Cleric';
  if (offhand && (hasTag(offhand, 'caster') || /staff|scepter|smiter|mirror|wand/.test(offhand.id))) {
    return bySlot.robes ? 'Wizard' : 'Battlemage';
  }
  if (weapon && (weapon.dmgType === 'ranged' || /bow/.test(weapon.id))) return 'Archer';
  if (hasTag(shield, 'shield') || hasTag(offhand, 'shield')) return 'Knight';
  if (noArmor) return 'Berserker';
  return 'Rogue';
}

function toPart(entry, golden) {
  return {
    slot: entry.slot,
    id: entry.id,
    file: entry.file,
    name: entry.name,
    stats: entry.stats,
    dmgType: entry.dmgType,
    tags: entry.tags ?? [],
    ability: entry.ability ?? null,
    zIndex: entry.zIndex ?? SLOT_Z_INDEX[entry.slot] ?? 0,
    golden,
    // tint only pieces whose art isn't already golden
    goldenTint: golden && !entry.golden,
  };
}

// --- Gear-derived extras (single source for UI and engine) -----------------

const RESIST_PATTERNS = {
  fire: /molten|volcanic|flame|fire|smoulder|ember|burn/,
  frost: /frost|frozen|ice|winter|chill/,
  poison: /poison|venom|irradiated|slime|rot|decay/,
  shadow: /ebon|night|shadow|dark|cursed|demon|nether|midnight|void/,
  holy: /holy|blessed|healer|sage|annoint|radiant|illuminated/,
};
const RESIST_PER_PIECE = 0.05;
const RESIST_CAP = 0.4;

/** Elemental resistances from gear themes: +5% per matching piece, cap 40%. */
export function deriveResistances(parts) {
  const res = {};
  for (const part of parts) {
    const stem = part.id.split('/')[1];
    for (const [kind, re] of Object.entries(RESIST_PATTERNS)) {
      if (re.test(stem)) res[kind] = Math.min(RESIST_CAP, (res[kind] ?? 0) + RESIST_PER_PIECE);
    }
  }
  for (const k of Object.keys(res)) res[k] = Math.round(res[k] * 100) / 100;
  return res;
}

// generic first tokens that don't indicate a gear family
const FAMILY_STOPWORDS = new Set([
  'the', 'of', 'medium', 'full', 'plate', 'plated', 'steel', 'staff', 'sword', 'mark',
]);

/** Set synergies: 2+ gear pieces sharing a name family, plus special combos. */
export function deriveSynergies(parts) {
  const families = {};
  for (const part of parts) {
    if (part.slot === 'bases' || part.slot === 'shieldstraps' || part.slot === 'conditions') continue;
    const token = part.id.split('/')[1].split('_')[0];
    if (token.length < 4 || FAMILY_STOPWORDS.has(token)) continue;
    (families[token] = families[token] ?? []).push(part.id);
  }

  const synergies = [];
  for (const [token, pieces] of Object.entries(families)) {
    if (pieces.length < 2) continue;
    const label = token[0].toUpperCase() + token.slice(1);
    synergies.push({ name: `${label} Set`, pieces, desc: `${pieces.length} matching ${label} pieces` });
  }

  const allTags = parts.flatMap((p) => p.tags ?? []);
  const has = (t) => allTags.includes(t);
  if (has('caster') && parts.some((p) => p.slot === 'robes')) {
    synergies.push({
      name: 'Battlemage',
      pieces: parts.filter((p) => p.slot === 'robes' || (p.tags ?? []).includes('caster')).map((p) => p.id),
      desc: 'Robe + caster off-hand: spells hit harder',
    });
  }
  if (allTags.filter((t) => t === 'vampiric').length >= 2) {
    synergies.push({
      name: 'Bloodpact',
      pieces: parts.filter((p) => (p.tags ?? []).includes('vampiric')).map((p) => p.id),
      desc: 'Two or more vampiric pieces: stronger lifesteal',
    });
  }
  if (has('dagger-hybrid') && has('caster')) {
    synergies.push({
      name: 'Spellblade',
      pieces: parts.filter((p) => (p.tags ?? []).some((t) => t === 'dagger-hybrid' || t === 'caster')).map((p) => p.id),
      desc: 'Dagger + caster off-hand: strikes carry spell damage',
    });
  }
  return synergies.sort((a, b) => a.name.localeCompare(b.name));
}

function emptyWeightFor(slot, tuning) {
  return tuning.slotEmptyWeights?.[slot] ?? tuning.emptySlotWeight;
}

// ⚠ Roll order and outcome space are consensus-critical after launch.
// Do not reorder rolls or add/remove outcomes without a generation-version
// bump — any change here shifts what every existing seed produces.
function rollParts(rng, manifest, tuning) {
  const pool = {};
  for (const slot of Z_ORDER) {
    pool[slot] = manifest.filter((e) => e.slot === slot && !e.missing);
  }
  const byId = new Map(manifest.map((e) => [e.id, e]));
  const bySlot = {};

  const rollGolden = (entry) => entry.golden || rng() < tuning.goldenChance;
  const pieceWeight = (e) => e.rarityWeight ?? tuning.pieceWeight;

  const pickRequired = (slot) => {
    const candidates = pool[slot];
    if (candidates.length === 0) throw new Error(`no assets available for required slot "${slot}"`);
    const entry = weightedPick(rng, candidates, pieceWeight);
    bySlot[slot] = toPart(entry, rollGolden(entry));
  };
  // Optional slots: EMPTY is a weighted outcome (empty weight vs the baseline
  // piece weight, independent of pool size, so spawn rates stay tunable).
  const rollOptional = (slot) => {
    const candidates = pool[slot];
    if (candidates.length === 0) return;
    const emptyWeight = emptyWeightFor(slot, tuning);
    if (rng() * (tuning.pieceWeight + emptyWeight) < emptyWeight) return; // rolled EMPTY
    const entry = weightedPick(rng, candidates, pieceWeight);
    bySlot[slot] = toPart(entry, rollGolden(entry));
  };

  // Guaranteed pieces first: base, boots, main-hand weapon.
  pickRequired('bases');
  pickRequired('boots');
  pickRequired('weapons');

  // Berserker roll: a small chance the fighter spawns with the bare-armor
  // loadout (no robe, no armor pieces) — the high-risk carry archetype needs
  // a real spawn rate (~3%) that independent slot rolls can't produce.
  const berserk = rng() < (tuning.berserkerChance ?? 0);

  // Robe next — it decides whether the belt/chest/shoulders/legs group rolls
  // at all. Robed fighters wear none of those; boots and gloves are allowed.
  if (!berserk) rollOptional('robes');
  const robed = Boolean(bySlot.robes);
  if (!robed) {
    pickRequired('belts'); // belt is 100% on every un-robed fighter
    if (!berserk) {
      rollOptional('legs');
      rollOptional('chest');
      rollOptional('shoulders');
    }
  }

  if (!berserk) rollOptional('gloves');
  rollOptional('helms');
  rollOptional('capes');
  rollOptional('conditions');

  // Off-hand: one combined roll across EMPTY | held items/staves | shields.
  // A shield brings its strap along (rear shield layer + front strap overlay).
  {
    const candidates = [...pool.offhands, ...pool.shields];
    if (candidates.length > 0) {
      const emptyWeight = emptyWeightFor('offhand', tuning);
      if (rng() * (tuning.pieceWeight + emptyWeight) >= emptyWeight) {
        const entry = weightedPick(rng, candidates, pieceWeight);
        const golden = rollGolden(entry);
        bySlot[entry.slot] = toPart(entry, golden);
        if (entry.slot === 'shields') {
          const stem = entry.id.split('/')[1];
          const strap = byId.get(`shieldstraps/${stem}_strap`);
          if (strap && !strap.missing) {
            // strap shares the shield's golden state; it is derived, not rolled
            bySlot.shieldstraps = toPart(strap, golden || strap.golden);
          }
        }
      }
    }
  }

  // Paint order: sort by zIndex (per-piece manifest override wins over the
  // slot default), so layering is data-driven, not hardcoded.
  return Object.values(bySlot).sort(
    (a, b) => a.zIndex - b.zIndex || a.slot.localeCompare(b.slot)
  );
}

/**
 * THE single stat-derivation function. The card UI, the demo pages and the
 * headless engine must all consume stats produced by this function — never
 * re-implement any part of the math (part sums, golden multipliers,
 * gap-bonus crit).
 *
 * @param {Array} parts  part objects with { slot, stats, golden }
 * @param {object} tuning
 * @returns {{ stats: {hp,atk,def,spd,crit}, gaps: number }}
 */
export function deriveStats(parts, tuning) {
  const stats = { hp: 0, atk: 0, def: 0, spd: 0 };
  for (const part of parts) {
    const mult = part.golden ? tuning.goldenStatMultiplier : 1;
    for (const key of Object.keys(stats)) {
      stats[key] += (part.stats?.[key] ?? 0) * mult;
    }
  }
  // integer stat lines on cards; golden bonuses still accumulate before rounding
  for (const key of Object.keys(stats)) stats[key] = Math.round(stats[key]);

  const covered = new Set(parts.map((p) => p.slot));
  // A robe covers chest/shoulders/legs — those never count as crit gaps.
  if (covered.has('robes')) for (const s of ROBE_REPLACES) covered.add(s);
  const gaps = ARMOR_SLOTS.filter((s) => !covered.has(s)).length;
  stats.crit = Math.round(gaps * tuning.critPerGap * 10000) / 10000;
  return { stats, gaps };
}

/**
 * Generate one fighter from a seed, with all data injected.
 *
 * @param {string} seed
 * @param {object} data        { manifest, tuning, names }
 * @param {object} [opts]
 * @param {Set<string>} [opts.existingIds] ids already taken; the generator
 *        re-rolls until it produces a fighter whose id is not in the set.
 */
export function generateFighterWith(seed, data, opts = {}) {
  const { manifest, tuning, names } = data;
  const existingIds = opts.existingIds ?? new Set();

  const rng = mulberry32(fnv1a(String(seed)));

  const MAX_ATTEMPTS = 1000;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const parts = rollParts(rng, manifest, tuning);
    const id = computeFighterId(parts.map((p) => p.id));
    if (existingIds.has(id)) continue; // collision: re-roll from the same stream

    const { stats } = deriveStats(parts, tuning);
    const bySlot = Object.fromEntries(parts.map((p) => [p.slot, p]));
    const doubleAttack = !bySlot.offhands && !bySlot.shields; // engine consumes this flag
    const tags = [...new Set(parts.flatMap((p) => p.tags ?? []))].sort();
    const dmgType = bySlot.weapons?.dmgType ?? 'physical';
    const dmgTypes = new Set([dmgType]);
    if (tags.includes('dagger-hybrid') || tags.includes('caster') || tags.includes('cleric')) {
      dmgTypes.add('spell');
    }

    const first = names.first[Math.floor(rng() * names.first.length)];
    const epithet = names.epithet[Math.floor(rng() * names.epithet.length)];

    return {
      id,
      name: `${first} ${epithet}`,
      cls: deriveClass(parts),
      parts: parts.map(({ slot, id: partId, name, zIndex, golden, goldenTint }) => ({
        slot,
        id: partId,
        name,
        zIndex,
        golden,
        goldenTint,
      })),
      stats,
      doubleAttack,
      tags,
      dmgType,
      dmgTypes: [...dmgTypes],
      abilities: parts
        .filter((p) => p.ability)
        .map((p) => ({
          source: p.id,
          name: p.ability.name,
          desc: p.ability.desc,
          kind: p.ability.kind ?? 'spell',
          // moves consumed from the fighter's turn (0 = always-on passive)
          cost: p.ability.cost ?? 1,
        })),
      synergies: deriveSynergies(parts),
      resistances: deriveResistances(parts),
      seed: String(seed),
      // canonical output location — buffers are never embedded in the fighter
      image: `generated/fighters/${id}.png`,
    };
  }
  throw new Error(`could not roll a unique fighter after ${MAX_ATTEMPTS} attempts (seed=${seed})`);
}
