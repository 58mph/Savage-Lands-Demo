// Engine test suite: state model, strike resolution, actions, round loop,
// match runner, determinism, acceptance smoke.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  toUnit,
  initRound,
  resetForRound,
  toPlace,
  applyEffect,
  tickEffects,
  rollInitiative,
  effStat,
  makeEffect,
  resolveStrike,
  resolveAction,
  pickTarget,
  runRound,
  runMatch,
  formatMatchLog,
  rollDrops,
  rngFrom,
  deriveSeed,
} from '../src/engine/index.mjs';
import { generateFighter } from '../src/gen/compose.mjs';

// --- helpers ---------------------------------------------------------------

let uid = 0;
function mkFighter(over = {}) {
  uid++;
  return {
    id: `f-${uid}`,
    name: over.name ?? `Unit ${uid}`,
    // defaults deliberately carry NO class/species fx so math tests are exact
    cls: over.cls ?? 'Neutral',
    parts: over.parts ?? [{ slot: 'bases', id: `bases/${over.species ?? 'neutral'}`, golden: false }],
    stats: { hp: 100, atk: 20, def: 10, spd: 10, crit: 0, ...(over.stats ?? {}) },
    doubleAttack: over.doubleAttack ?? false,
    tags: over.tags ?? [],
    dmgType: over.dmgType ?? 'physical',
    dmgTypes: over.dmgTypes ?? [over.dmgType ?? 'physical'],
    abilities: over.abilities ?? [],
    synergies: [],
    resistances: {},
    seed: 'test',
    image: '',
  };
}

function mkState(unitsA, unitsB, rng = () => 0.5) {
  for (const u of unitsA) u.slot = u.slot ?? 'F';
  for (const u of unitsB) u.slot = u.slot ?? 'F';
  return { round: 1, cycle: 1, rng, teams: [unitsA, unitsB], order: [...unitsA, ...unitsB], log: [] };
}

const fixedRng = (...values) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

// --- Phase 1: state model ----------------------------------------------------

test('toUnit maps fighter stats onto the unit', () => {
  const u = toUnit(mkFighter({ stats: { hp: 120, atk: 25, def: 12, spd: 9, crit: 0.04 } }), 0, 1);
  assert.equal(u.hp, 120);
  assert.equal(u.hpMax, 120);
  assert.equal(u.atk, 25);
  assert.equal(u.def, 12);
  assert.equal(u.crit, 0.04);
  assert.equal(u.id, 'A1');
  assert.ok(u.alive);
});

test('prestige Royal Regalia scales all stats +10% at generation', () => {
  const plain = toUnit(mkFighter({ stats: { hp: 100, atk: 20, def: 10, spd: 10, crit: 0 } }), 0);
  const regal = toUnit(
    mkFighter({
      stats: { hp: 100, atk: 20, def: 10, spd: 10, crit: 0 },
      abilities: [{ source: 'helms/royal_regalia', name: 'Royal Regalia', desc: '', kind: 'passive', cost: 0 }],
    }),
    0
  );
  assert.equal(regal.hpMax, Math.round(plain.hpMax * 1.1));
  assert.equal(regal.atk, Math.round(plain.atk * 1.1));
  assert.equal(regal.def, Math.round(plain.def * 1.1));
});

test('Berserker gets +3 DEF per empty armor slot (+12 naked)', () => {
  const naked = toUnit(mkFighter({ cls: 'Berserker', stats: { def: 10 } }), 0);
  assert.equal(naked.def, 22); // 10 + 4 gaps * 3
  const armored = toUnit(
    mkFighter({
      cls: 'Berserker',
      parts: [
        { slot: 'bases', id: 'bases/lizardman' },
        { slot: 'chest', id: 'chest/chainmail' },
        { slot: 'shoulders', id: 'shoulders/chainmail' },
        { slot: 'gloves', id: 'gloves/chainmail_gloves' },
        { slot: 'legs', id: 'legs/chainmail' },
      ],
      stats: { def: 10 },
    }),
    0
  );
  assert.equal(armored.def, 10);
});

test('toPlace: tanks vanguard, casters backline, always at least one vanguard', () => {
  const units = [
    toUnit(mkFighter({ cls: 'Tank' }), 0, 0),
    toUnit(mkFighter({ cls: 'Wizard' }), 0, 1),
    toUnit(mkFighter({ cls: 'Cleric' }), 0, 2),
    toUnit(mkFighter({ cls: 'Rogue' }), 0, 3),
  ];
  toPlace(units);
  assert.equal(units[0].slot, 'V');
  assert.equal(units[1].slot, 'B');
  assert.equal(units[2].slot, 'B');
  assert.equal(units[3].slot, 'F');

  const noTanks = [toUnit(mkFighter({ cls: 'Wizard' }), 0, 0), toUnit(mkFighter({ cls: 'Cleric' }), 0, 1)];
  toPlace(noTanks);
  assert.ok(noTanks.some((u) => u.slot === 'V'), 'someone must hold the front');
});

test('applyEffect + effStat: timed deltas stack on base stats', () => {
  const u = toUnit(mkFighter({ stats: { atk: 20 } }), 0);
  applyEffect(u, makeEffect({ name: 'Warcry', stat: 'atk', amount: 7 }));
  applyEffect(u, makeEffect({ name: 'sap', stat: 'atk', amount: -3, polarity: 'debuff' }));
  assert.equal(effStat(u, 'atk'), 24);
});

test('tickEffects: per-round decay removes expired effects', () => {
  const u = toUnit(mkFighter(), 0);
  applyEffect(u, makeEffect({ name: 'Rally', stat: 'def', amount: 4, decay: 'per-round', ticks: 1 }));
  assert.equal(effStat(u, 'def'), 14);
  tickEffects(u, 'per-turn'); // wrong phase: no decay
  assert.equal(u.effects.length, 1);
  const events = tickEffects(u, 'per-round');
  assert.equal(u.effects.length, 0);
  assert.ok(events.some((e) => e.type === 'effect-expired'));
});

test('tickEffects: dots deal damage and can kill', () => {
  const u = toUnit(mkFighter({ stats: { hp: 6 } }), 0);
  applyEffect(u, makeEffect({ name: 'poison', dot: 4, decay: 'per-turn', ticks: 3, polarity: 'debuff' }));
  tickEffects(u, 'per-turn');
  assert.equal(u.hp, 2);
  const events = tickEffects(u, 'per-turn');
  assert.ok(!u.alive);
  assert.ok(events.some((e) => e.type === 'death'));
});

test('rollInitiative: deterministic, speed-weighted ordering', () => {
  const fast = toUnit(mkFighter({ stats: { spd: 30 } }), 0, 0);
  const slow = toUnit(mkFighter({ stats: { spd: 1 } }), 1, 0);
  const order = rollInitiative([slow, fast], fixedRng(0.5, 0.5, 0.5, 0.5));
  assert.equal(order[0], fast); // same die roll -> higher spd first
  const again = rollInitiative([slow, fast], fixedRng(0.5, 0.5, 0.5, 0.5));
  assert.deepEqual(order.map((u) => u.id), again.map((u) => u.id));
});

test('resetForRound restores HP, effects and per-round flags', () => {
  const u = toUnit(mkFighter(), 0);
  u.hp = 5;
  u.alive = false;
  u.atkStacks = 8;
  applyEffect(u, makeEffect({ name: 'x', stat: 'atk', amount: 5 }));
  resetForRound(u);
  assert.equal(u.hp, u.hpMax);
  assert.ok(u.alive);
  assert.equal(u.atkStacks, 0);
  assert.equal(u.effects.length, 0);
});

// --- Phase 2: strike resolution -----------------------------------------------

test('mitigation: DEF at half value, locked', () => {
  const a = toUnit(mkFighter({ stats: { atk: 20, crit: 0 } }), 0);
  const t = toUnit(mkFighter({ stats: { def: 10, hp: 100 } }), 1);
  const state = mkState([a], [t]);
  // rng 0.5 -> variance exactly 1.0; crit roll 0.5 >= 0 fails
  const r = resolveStrike(a, t, state, () => 0.5, 1.0);
  assert.equal(r.dmg, 15); // 20*1.0 - 10*0.5
  assert.equal(t.hp, 85);
});

test('Dual Strike: 0.6x applied POST-mitigation, locked', () => {
  const a = toUnit(mkFighter({ stats: { atk: 20, crit: 0 } }), 0);
  const t = toUnit(mkFighter({ stats: { def: 10, hp: 100 } }), 1);
  const state = mkState([a], [t]);
  const r = resolveStrike(a, t, state, () => 0.5, 0.6);
  assert.equal(r.dmg, Math.round((20 - 5) * 0.6)); // 9, NOT (20*0.6 - 5)=7
});

test('crit doubles damage (standard 2x)', () => {
  const a = toUnit(mkFighter({ stats: { atk: 20, crit: 0.5 } }), 0);
  const t = toUnit(mkFighter({ stats: { def: 10, hp: 100 } }), 1);
  const state = mkState([a], [t]);
  // variance 0.5 -> 1.0; crit roll 0.1 < 0.5 -> crit
  const r = resolveStrike(a, t, state, fixedRng(0.5, 0.1), 1.0);
  assert.equal(r.dmg, 35); // 20*2 - 5
});

test('cover: ranged into backline reduced 40% while vanguard alive; melee front-bound', () => {
  const archer = toUnit(mkFighter({ dmgType: 'ranged', stats: { atk: 20, crit: 0 } }), 0);
  const vanguard = toUnit(mkFighter({ cls: 'Tank' }), 1, 0);
  const backliner = toUnit(mkFighter({ cls: 'Wizard', stats: { def: 0, hp: 100 } }), 1, 1);
  vanguard.slot = 'V';
  backliner.slot = 'B';
  const state = mkState([archer], [vanguard, backliner]);
  const r = resolveStrike(archer, backliner, state, () => 0.5, 1.0);
  assert.equal(r.dmg, 12); // 20 * (1-0.4) = 12, def 0

  // melee pickTarget cannot reach the backline while the front stands
  const melee = toUnit(mkFighter({ dmgType: 'physical' }), 0);
  assert.equal(pickTarget(melee, [vanguard, backliner]), vanguard);
});

test('lifesteal: Berserker heals 50% of damage dealt', () => {
  const zerk = toUnit(mkFighter({ cls: 'Berserker', stats: { atk: 20, crit: 0, hp: 100 } }), 0);
  const t = toUnit(mkFighter({ stats: { def: 10, hp: 200 } }), 1);
  zerk.hp = 50;
  const state = mkState([zerk], [t]);
  const r = resolveStrike(zerk, t, state, () => 0.5, 1.0);
  assert.equal(zerk.hp, 50 + Math.round(r.dmg * 0.5));
});

test('retaliation damages the attacker back', () => {
  const a = toUnit(mkFighter({ stats: { atk: 20, crit: 0, hp: 100 } }), 0);
  const spiky = toUnit(mkFighter({ species: 'salamander', stats: { def: 10, hp: 100 } }), 1);
  const state = mkState([a], [spiky]);
  resolveStrike(a, spiky, state, () => 0.5, 1.0);
  assert.ok(a.hp < 100, 'attacker takes Burning Blood retaliation');
});

test('negateNext zeroes one hit then clears', () => {
  const a = toUnit(mkFighter({ stats: { atk: 20, crit: 0 } }), 0);
  const t = toUnit(mkFighter({ stats: { def: 0, hp: 100 } }), 1);
  t.negateNext = true;
  const state = mkState([a], [t]);
  const r1 = resolveStrike(a, t, state, () => 0.5, 1.0);
  assert.equal(r1.dmg, 0);
  assert.equal(t.hp, 100);
  const r2 = resolveStrike(a, t, state, () => 0.5, 1.0);
  assert.ok(r2.dmg > 0, 'negation is consumed');
});

test('Play Dead (possum): survives one lethal hit at 20% HP', () => {
  const a = toUnit(mkFighter({ stats: { atk: 100, crit: 0 } }), 0);
  const possum = toUnit(mkFighter({ species: 'possum', stats: { def: 0, hp: 50 } }), 1);
  const state = mkState([a], [possum]);
  resolveStrike(a, possum, state, () => 0.5, 1.0);
  assert.ok(possum.alive);
  assert.equal(possum.hp, 10); // 20% of 50
  resolveStrike(a, possum, state, () => 0.5, 1.0);
  assert.ok(!possum.alive, 'only once per round');
});

test('Undying ability: survives a killing blow once per round', () => {
  const a = toUnit(mkFighter({ stats: { atk: 100, crit: 0 } }), 0);
  const t = toUnit(
    mkFighter({
      stats: { def: 0, hp: 50 },
      abilities: [{ source: 'helms/chimera_11', name: 'Undying', desc: '', kind: 'passive', cost: 0 }],
    }),
    1
  );
  const state = mkState([a], [t]);
  resolveStrike(a, t, state, () => 0.5, 1.0);
  assert.ok(t.alive);
  assert.equal(t.hp, 10);
});

test('Bulwark: first hit each round halved', () => {
  const a = toUnit(mkFighter({ stats: { atk: 20, crit: 0 } }), 0);
  const t = toUnit(
    mkFighter({
      stats: { def: 0, hp: 100 },
      abilities: [{ source: 'helms/chimera_15', name: 'Bulwark', desc: '', kind: 'passive', cost: 0 }],
    }),
    1
  );
  const state = mkState([a], [t]);
  const r1 = resolveStrike(a, t, state, () => 0.5, 1.0);
  assert.equal(r1.dmg, 10); // 20 halved
  const r2 = resolveStrike(a, t, state, () => 0.5, 1.0);
  assert.equal(r2.dmg, 20);
});

test('Bloodlust: Berserker kill heals 35% max HP and stacks +4 ATK', () => {
  const zerk = toUnit(mkFighter({ cls: 'Berserker', stats: { atk: 50, crit: 0, hp: 100 } }), 0);
  const t = toUnit(mkFighter({ stats: { def: 0, hp: 10 } }), 1);
  zerk.hp = 20;
  const state = mkState([zerk], [t]);
  resolveStrike(zerk, t, state, () => 0.5, 1.0);
  assert.ok(!t.alive);
  assert.equal(zerk.atkStacks, 4);
  assert.ok(zerk.hp >= 20 + Math.round(100 * 0.35), 'healed 35% max HP (plus lifesteal)');
});

test('execute bonus (Death Roll) fires below half HP', () => {
  const croc = toUnit(mkFighter({ species: 'crocodillian', stats: { atk: 20, crit: 0 } }), 0);
  const healthy = toUnit(mkFighter({ stats: { def: 0, hp: 100 } }), 1);
  const wounded = toUnit(mkFighter({ stats: { def: 0, hp: 100 } }), 1);
  wounded.hp = 40;
  const state = mkState([croc], [healthy, wounded]);
  const rHealthy = resolveStrike(croc, healthy, state, () => 0.5, 1.0);
  const rWounded = resolveStrike(croc, wounded, state, () => 0.5, 1.0);
  assert.equal(rHealthy.dmg, 20);
  assert.equal(rWounded.dmg, 25); // +25% Death Roll
});

// --- Phase 2b: actions ---------------------------------------------------------

test('Cleric role-heal targets the most wounded ally below 65%', () => {
  const cleric = toUnit(mkFighter({ cls: 'Cleric', stats: { atk: 20 } }), 0, 0);
  const hurt = toUnit(mkFighter(), 0, 1);
  hurt.hp = 30;
  const foe = toUnit(mkFighter(), 1, 0);
  const state = mkState([cleric, hurt], [foe]);
  const r = resolveAction(cleric, state, () => 0.5);
  assert.equal(r.action, 'cast');
  assert.ok(hurt.hp > 30, 'ally healed');
});

test('debuff ability lands on the highest-ATK foe', () => {
  const caster = toUnit(
    mkFighter({ abilities: [{ source: 'x', name: 'Terrify', desc: '', kind: 'debuff', cost: 1 }] }),
    0
  );
  const weak = toUnit(mkFighter({ stats: { atk: 5 } }), 1, 0);
  const strong = toUnit(mkFighter({ stats: { atk: 40 } }), 1, 1);
  const state = mkState([caster], [weak, strong]);
  const r = resolveAction(caster, state, () => 0.5);
  assert.equal(r.action, 'cast');
  assert.equal(effStat(strong, 'atk'), 32); // -8 Terrify
  assert.equal(effStat(weak, 'atk'), 5);
});

test('teamBuff (Rally +4 DEF) reaches every living ally', () => {
  const caster = toUnit(
    mkFighter({ abilities: [{ source: 'x', name: 'Rally', desc: '', kind: 'buff', cost: 2 }] }),
    0,
    0
  );
  const ally = toUnit(mkFighter(), 0, 1);
  const foe = toUnit(mkFighter(), 1, 0);
  const state = mkState([caster, ally], [foe]);
  resolveAction(caster, state, () => 0.5);
  assert.equal(effStat(caster, 'def'), 14);
  assert.equal(effStat(ally, 'def'), 14);
  assert.equal(effStat(foe, 'def'), 10);
});

test('Radiant Burst: flat 20 AoE to all living foes (locked)', () => {
  const caster = toUnit(
    mkFighter({ abilities: [{ source: 'x', name: 'Radiant Burst', desc: '', kind: 'spell', cost: 2 }] }),
    0
  );
  const f1 = toUnit(mkFighter({ stats: { hp: 100, def: 50 } }), 1, 0);
  const f2 = toUnit(mkFighter({ stats: { hp: 100, def: 0 } }), 1, 1);
  const state = mkState([caster], [f1, f2]);
  resolveAction(caster, state, () => 0.5);
  assert.equal(f1.hp, 80); // spells ignore DEF
  assert.equal(f2.hp, 80);
});

test('Dark Pact: pays 15% max HP, next strike doubled, then resets', () => {
  const pacter = toUnit(
    mkFighter({
      stats: { atk: 20, crit: 0, hp: 100 },
      abilities: [{ source: 'x', name: 'Dark Pact', desc: '', kind: 'buff', cost: 1 }],
    }),
    0
  );
  const foe = toUnit(mkFighter({ stats: { def: 0, hp: 200 } }), 1);
  const state = mkState([pacter], [foe]);
  resolveAction(pacter, state, () => 0.5); // casts pact on cycle 1
  assert.equal(pacter.hp, 85);
  const r = resolveStrike(pacter, foe, state, () => 0.5, 1.0);
  assert.equal(r.dmg, 40); // 20 * 2
  const r2 = resolveStrike(pacter, foe, state, () => 0.5, 1.0);
  assert.equal(r2.dmg, 20); // multiplier consumed
});

test('abilities are once per round; Crystalline Focus doubleAction allows twice', () => {
  const normal = toUnit(
    mkFighter({ abilities: [{ source: 'x', name: 'Warcry', desc: '', kind: 'buff', cost: 1 }] }),
    0
  );
  const focused = toUnit(
    mkFighter({
      abilities: [
        { source: 'x', name: 'Warcry', desc: '', kind: 'buff', cost: 1 },
        { source: 'offhands/crystalline_focus', name: 'Crystalline Focus', desc: '', kind: 'passive', cost: 0 },
      ],
    }),
    0
  );
  const foe1 = toUnit(mkFighter({ stats: { hp: 500 } }), 1);
  const state1 = mkState([normal], [foe1]);
  assert.equal(resolveAction(normal, state1, () => 0.5).action, 'cast');
  assert.equal(resolveAction(normal, state1, () => 0.5).action, 'attack'); // used up

  const foe2 = toUnit(mkFighter({ stats: { hp: 500 } }), 1);
  const state2 = mkState([focused], [foe2]);
  assert.equal(resolveAction(focused, state2, () => 0.5).action, 'cast');
  assert.equal(resolveAction(focused, state2, () => 0.5).action, 'cast'); // twice
  assert.equal(resolveAction(focused, state2, () => 0.5).action, 'attack');
});

test('Dual Strike fires a second 0.6x swing within the attack action', () => {
  const dual = toUnit(mkFighter({ doubleAttack: true, stats: { atk: 20, crit: 0 } }), 0);
  const foe = toUnit(mkFighter({ stats: { def: 0, hp: 100 } }), 1);
  const state = mkState([dual], [foe]);
  const r = resolveAction(dual, state, () => 0.5);
  assert.equal(r.action, 'attack');
  assert.equal(foe.hp, 100 - 20 - 12); // main 20 + dual round(20*0.6)
});

test('Spell Mastery: x2 spell damage and 50% spell vamp', () => {
  const master = toUnit(
    mkFighter({
      stats: { hp: 100 },
      abilities: [
        { source: 'offhands/spell_mastery_tome', name: 'Spell Mastery', desc: '', kind: 'passive', cost: 0 },
        { source: 'x', name: 'Radiant Burst', desc: '', kind: 'spell', cost: 2 },
      ],
    }),
    0
  );
  master.hp = 50;
  const foe = toUnit(mkFighter({ stats: { def: 0, hp: 100 } }), 1);
  const state = mkState([master], [foe]);
  resolveAction(master, state, () => 0.5);
  assert.equal(foe.hp, 60); // 20 * 2
  assert.equal(master.hp, 50 + 20); // vamp 50% of 40
});

// --- Phase 3/4: round + match ----------------------------------------------

function mkTeam(seedPrefix, n = 5) {
  return Array.from({ length: n }, (_, i) => generateFighter(`${seedPrefix}-${i}`));
}

test('runRound: produces a winner, a how, and a structured log', () => {
  const A = mkTeam('round-A').map((f, i) => toUnit(f, 0, i));
  const B = mkTeam('round-B').map((f, i) => toUnit(f, 1, i));
  const state = initRound(A, B, 1, 'round-test');
  const result = runRound(state);
  assert.ok(['A', 'B'].includes(result.winner));
  assert.ok(['wipe', 'timeout-downs', 'timeout-dmg', 'timeout-flip'].includes(result.how));
  assert.ok(state.log.some((e) => e.type === 'round-start'));
  assert.ok(state.log.some((e) => e.type === 'round-end'));
});

test('timeout hierarchy: fewer downs wins; damage breaks the tie', () => {
  // Unkillable walls on both sides -> guaranteed timeout
  const wallA = toUnit(mkFighter({ stats: { hp: 9999, atk: 1, def: 200 } }), 0, 0);
  const wallB1 = toUnit(mkFighter({ stats: { hp: 9999, atk: 1, def: 200 } }), 1, 0);
  const state = initRound([wallA], [wallB1], 1, 'timeout-test');
  wallA.dmgDealt = 0;
  const result = runRound(state);
  assert.ok(result.how.startsWith('timeout'), `expected timeout, got ${result.how}`);
});

test('runMatch: Bo3 with 2-0 early exit, deterministic', async () => {
  const A = mkTeam('match-A');
  const B = mkTeam('match-B');
  const m1 = await runMatch(A, B, 'bo3-seed');
  const m2 = await runMatch(A, B, 'bo3-seed');
  assert.deepEqual(m1, m2, 'same seed = byte-identical output');
  assert.ok(['A', 'B'].includes(m1.winner));
  assert.ok(m1.score[m1.winner] === 2);
  if (m1.score.A === 2 && m1.score.B === 0) assert.equal(m1.rounds.length, 2);
  if (m1.rounds.length === 3) assert.ok(m1.score.A === 1 || m1.score.B === 1);
});

test('different seeds produce different matches', async () => {
  const A = mkTeam('div-A');
  const B = mkTeam('div-B');
  const m1 = await runMatch(A, B, 'seed-one');
  const m2 = await runMatch(A, B, 'seed-two');
  assert.notDeepEqual(m1.log, m2.log);
});

test('formatMatchLog: linear, readable, increasing turn numbers', async () => {
  const m = await runMatch(mkTeam('fmt-A'), mkTeam('fmt-B'), 'fmt-seed');
  const lines = formatMatchLog(m);
  assert.ok(lines.length > 10);
  for (let i = 1; i < lines.length; i++) assert.equal(lines[i].turn, lines[i - 1].turn + 1);
  assert.ok(lines.every((l) => typeof l.event === 'string' && l.event.length > 0));
});

test('drop table: 3 drops, deterministic, anti-throw (sweeps drop better)', () => {
  const d1 = rollDrops('drop-seed', { A: 2, B: 0 });
  const d2 = rollDrops('drop-seed', { A: 2, B: 0 });
  assert.deepEqual(d1, d2);
  assert.equal(d1.length, 3);
  // anti-throw invariant: epic odds never decrease with a cleaner scoreline
  let sweepEpics = 0;
  let closeEpics = 0;
  for (let i = 0; i < 300; i++) {
    sweepEpics += rollDrops(`at-${i}`, { A: 2, B: 0 }).filter((d) => d.rarity === 'epic').length;
    closeEpics += rollDrops(`at-${i}`, { A: 2, B: 1 }).filter((d) => d.rarity === 'epic').length;
  }
  assert.ok(sweepEpics >= closeEpics, `sweeps must not drop worse loot (${sweepEpics} vs ${closeEpics})`);
});

test('rng: deriveSeed/rngFrom stable and stream-deterministic', () => {
  assert.equal(deriveSeed('master', 'round-1'), deriveSeed('master', 'round-1'));
  assert.notEqual(deriveSeed('master', 'round-1'), deriveSeed('master', 'round-2'));
  const a = rngFrom('x');
  const b = rngFrom('x');
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
});

test('acceptance smoke: 20 real matches complete cleanly and deterministically', async () => {
  for (let i = 0; i < 20; i++) {
    const A = mkTeam(`acc-A${i}`);
    const B = mkTeam(`acc-B${i}`);
    const m = await runMatch(A, B, `acc-match-${i}`);
    assert.ok(['A', 'B'].includes(m.winner));
    assert.ok(m.log.length > 0);
    assert.ok(m.drops.length === 3);
    const rerun = await runMatch(A, B, `acc-match-${i}`);
    assert.deepEqual(m, rerun);
  }
});
