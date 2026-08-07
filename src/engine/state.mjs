// State model: Fighter -> Unit conversion, formation placement, effect
// bookkeeping, initiative. Pure and deterministic.

import { ACTIVE_ABILITIES, PASSIVE_ABILITIES, SPECIES_FX, CLASS_FX } from './effects.mjs';
import { deriveSeed, rngFrom, d20 } from './rng.mjs';

const ARMOR_SLOTS = ['chest', 'shoulders', 'gloves', 'legs'];

/**
 * Convert a generateFighter() fighter into the in-engine Unit.
 * Prestige stat scaling (Royal Regalia +10% all) is applied here,
 * at generation time — before any combat.
 */
export function toUnit(fighter, teamIndex, slotIndex = 0) {
  const species = fighter.parts.find((p) => p.slot === 'bases')?.id.split('/')[1] ?? 'unknown';

  // merge fx: species -> class -> passive abilities (incl. prestige)
  const fx = {};
  const merge = (src) => {
    if (!src) return;
    for (const [k, v] of Object.entries(src)) {
      if (typeof v === 'number') fx[k] = (fx[k] ?? 0) + v;
      else fx[k] = v;
    }
  };
  merge(SPECIES_FX[species]);
  merge(CLASS_FX[fighter.cls]);

  const actions = [];
  for (const ab of fighter.abilities ?? []) {
    if (PASSIVE_ABILITIES[ab.name]) merge(PASSIVE_ABILITIES[ab.name]);
    else if (ACTIVE_ABILITIES[ab.name]) actions.push({ name: ab.name, ...ACTIVE_ABILITIES[ab.name] });
  }

  // Berserker armor-gap bonus (+3 DEF per empty armor slot; robes cover 3)
  let gapDef = 0;
  if (fx.defPerGap) {
    const covered = new Set(fighter.parts.map((p) => p.slot));
    if (covered.has('robes')) for (const s of ['chest', 'shoulders', 'legs']) covered.add(s);
    const gaps = ARMOR_SLOTS.filter((s) => !covered.has(s)).length;
    gapDef = gaps * fx.defPerGap;
  }

  const scale = fx.statScale ?? 1; // Royal Regalia +10% all stats
  const s = fighter.stats;

  return {
    id: `${teamIndex === 0 ? 'A' : 'B'}${slotIndex}`,
    fighterId: fighter.id,
    name: fighter.name,
    cls: fighter.cls,
    species,
    team: teamIndex,
    hpMax: Math.round(s.hp * scale),
    hp: Math.round(s.hp * scale),
    atk: Math.round(s.atk * scale),
    def: Math.round((s.def + gapDef + (fx.defBonus ?? 0)) * scale),
    spd: Math.round((s.spd + (fx.spdBonus ?? 0)) * scale),
    crit: Math.round((s.crit + (fx.critBonus ?? 0)) * 10000) / 10000,
    dmgType: fighter.dmgType,
    dmgTypes: fighter.dmgTypes ?? [fighter.dmgType],
    doubleAttack: fighter.doubleAttack, // Dual Strike (bare off-hand)
    resistances: fighter.resistances ?? {},
    fx,
    actions,
    effects: [], // timed buffs/debuffs/dots
    slot: null, // formation: 'V' | 'F' | 'B'
    alive: true,
    // per-round battle state
    strikesMade: 0,
    struckThisRound: false,
    firstHitTaken: false,
    playedDead: false,
    undyingUsed: false,
    secondWindUsed: false,
    abilityCasts: 0,
    abilityUsed: {}, // name -> casts this round
    pactMult: 1,
    nextStrikeBonus: 0,
    negateNext: false,
    atkStacks: 0, // Bloodlust stacking ATK
    dmgDealt: 0,
    familiars: [], // { dmgPerCycle }
  };
}

/** Reset per-round state (fresh HP, effects, flags) — rounds start clean. */
export function resetForRound(unit) {
  unit.hp = unit.hpMax;
  unit.alive = true;
  unit.effects = [];
  unit.strikesMade = 0;
  unit.struckThisRound = false;
  unit.firstHitTaken = false;
  unit.playedDead = false;
  unit.undyingUsed = false;
  unit.secondWindUsed = false;
  unit.abilityCasts = 0;
  unit.abilityUsed = {};
  unit.pactMult = 1;
  unit.nextStrikeBonus = 0;
  unit.negateNext = false;
  unit.atkStacks = 0;
  unit.dmgDealt = 0;
  unit.familiars = [];
}

/**
 * Formation placement: V (vanguard) anchors cover, F (flank) partial,
 * B (backline) protected. Tanks/Knights vanguard, casters/ranged backline,
 * the rest flank.
 */
export function toPlace(units) {
  const backliners = new Set(['Wizard', 'Cleric', 'Archer', 'Battlemage']);
  const vanguards = new Set(['Tank', 'Knight']);
  for (const u of units) {
    if (vanguards.has(u.cls)) u.slot = 'V';
    else if (backliners.has(u.cls)) u.slot = 'B';
    else u.slot = 'F';
  }
  // every team needs at least one body up front
  if (!units.some((u) => u.slot === 'V')) {
    const front = units.find((u) => u.slot === 'F') ?? units[0];
    front.slot = 'V';
  }
  return units;
}

/** Effective stat including timed effects. */
export function effStat(unit, stat) {
  let v = unit[stat];
  if (stat === 'atk') v += unit.atkStacks;
  for (const e of unit.effects) if (e.stat === stat) v += e.amount;
  return Math.max(0, v);
}

export function applyEffect(unit, effect) {
  unit.effects.push(effect);
}

/**
 * Tick timed effects. phase: 'per-turn' | 'per-round'.
 * DoTs deal damage on per-turn ticks; effects expire when ticks hit 0.
 * Returns events for the log.
 */
export function tickEffects(unit, phase) {
  const events = [];
  const kept = [];
  for (const e of unit.effects) {
    if (e.decay !== phase) {
      kept.push(e);
      continue;
    }
    if (e.dot > 0 && unit.alive && !unit.fx.dotImmune) {
      unit.hp -= e.dot;
      events.push({ type: 'dot', unit: unit.id, effect: e.name, dmg: e.dot });
      if (unit.hp <= 0) {
        unit.alive = false;
        events.push({ type: 'death', unit: unit.id, by: e.name });
      }
    }
    e.ticks -= 1;
    if (e.ticks > 0) kept.push(e);
    else events.push({ type: 'effect-expired', unit: unit.id, effect: e.name });
  }
  unit.effects = kept;
  return events;
}

/**
 * Initiative: d20 + spd, ties break to higher spd, then deterministic flip.
 */
export function rollInitiative(units, rng) {
  const rolls = units.map((u) => ({ u, roll: d20(rng) + effStat(u, 'spd'), flip: rng() }));
  rolls.sort((a, b) => b.roll - a.roll || effStat(b.u, 'spd') - effStat(a.u, 'spd') || a.flip - b.flip);
  return rolls.map((r) => r.u);
}

/** Initialize one round of a match. */
export function initRound(unitsA, unitsB, roundNum, masterSeed) {
  const seed = deriveSeed(masterSeed, `round-${roundNum}`);
  const rng = rngFrom(seed);
  for (const u of [...unitsA, ...unitsB]) resetForRound(u);
  toPlace(unitsA);
  toPlace(unitsB);
  const order = rollInitiative([...unitsA, ...unitsB], rng);
  return {
    round: roundNum,
    seed,
    rng,
    teams: [unitsA, unitsB],
    order,
    cycle: 0,
    log: [],
  };
}
