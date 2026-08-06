// Step 5 — Tests for the fighter compositor pipeline (node:test).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  generateFighter,
  computeFighterId,
  fnv1a,
  ARMOR_SLOTS,
  deriveClass,
  deriveStats,
} from '../src/gen/compose.mjs';
import { renderFighter } from '../src/gen/render.mjs';
import { SLOTS } from '../scripts/scan-assets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'attributes.json'), 'utf8'));
const tuning = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'tuning.json'), 'utf8'));

test('1. determinism: same seed -> deep-equal fighter and byte-identical PNG', async () => {
  const a = generateFighter('x');
  const b = generateFighter('x');
  assert.deepEqual(a, b);

  const pngA = await renderFighter(a);
  const pngB = await renderFighter(b);
  assert.ok(pngA.equals(pngB), 'PNG buffers must be byte-identical');
});

test('2. uniqueness: id changes iff parts change; same parts -> same id', () => {
  const fighter = generateFighter('unique-test');
  const partIds = fighter.parts.map((p) => p.id);

  // fighter.id is derived from its parts
  assert.equal(fighter.id, computeFighterId(partIds));

  // identical parts (regardless of seed/roll order) -> identical id
  assert.equal(computeFighterId(partIds), computeFighterId([...partIds].reverse()));

  // changing any part -> different id
  const mutated = [...partIds];
  mutated[0] = 'bases/some_other_base';
  assert.notEqual(computeFighterId(partIds), computeFighterId(mutated));

  // different seeds with different parts -> different ids
  const other = generateFighter('unique-test-2');
  if (JSON.stringify(other.parts.map((p) => p.id)) !== JSON.stringify(partIds)) {
    assert.notEqual(other.id, fighter.id);
  }
});

test('3. gap bonuses: zero armor -> +8% crit + Berserker; empty offhand -> doubleAttack', () => {
  // Force every optional slot (and the offhand/shield roll) to come up EMPTY.
  const allEmpty = { emptySlotWeight: Number.MAX_SAFE_INTEGER, slotEmptyWeights: {} };

  // Find a seed whose weapon is physical (staff/bow would win the class label).
  let fighter = null;
  for (let i = 0; i < 200; i++) {
    const f = generateFighter(`gap-${i}`, { tuning: allEmpty });
    if (f.dmgType === 'physical' && !f.tags.includes('dagger-hybrid')) {
      fighter = f;
      break;
    }
  }
  assert.ok(fighter, 'expected to find a physical-weapon fighter');

  const slots = fighter.parts.map((p) => p.slot);
  for (const armor of ARMOR_SLOTS) assert.ok(!slots.includes(armor));

  assert.equal(fighter.stats.crit, 4 * tuning.critPerGap); // +8% with defaults
  assert.equal(fighter.cls, 'Berserker');
  assert.equal(fighter.doubleAttack, true);

  // and a fighter with an offhand does NOT get the flag
  let withOffhand = null;
  for (let i = 0; i < 200; i++) {
    const f = generateFighter(`off-${i}`);
    if (f.parts.some((p) => p.slot === 'offhands')) {
      withOffhand = f;
      break;
    }
  }
  assert.ok(withOffhand, 'expected to find a fighter with an offhand');
  assert.equal(withOffhand.doubleAttack, false);
});

test('4. manifest integrity: assets <-> manifest match; weapons all have dmgType', () => {
  const filesOnDisk = new Set();
  for (const slot of SLOTS) {
    const dir = path.join(ROOT, 'assets', slot);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (file.toLowerCase().endsWith('.png')) {
        filesOnDisk.add(`${slot}/${path.basename(file, '.png')}`);
      }
    }
  }

  // every file has a manifest entry
  const manifestIds = new Set(manifest.map((e) => e.id));
  for (const id of filesOnDisk) {
    assert.ok(manifestIds.has(id), `asset file without manifest entry: ${id}`);
  }
  // every (non-missing-flagged) entry has a file
  for (const entry of manifest) {
    if (entry.missing) continue;
    assert.ok(filesOnDisk.has(entry.id), `manifest entry without asset file: ${entry.id}`);
    assert.ok(fs.existsSync(path.join(ROOT, entry.file)), `bad file path: ${entry.file}`);
  }
  // all weapons have a valid dmgType
  for (const entry of manifest.filter((e) => e.slot === 'weapons')) {
    assert.ok(
      ['physical', 'ranged', 'spell'].includes(entry.dmgType),
      `weapon without valid dmgType: ${entry.id} (${entry.dmgType})`
    );
  }
});

test('5. re-roll: existingIds containing the would-be id -> different fighter', () => {
  const first = generateFighter('reroll-seed');
  const rerolled = generateFighter('reroll-seed', { existingIds: new Set([first.id]) });
  assert.notEqual(rerolled.id, first.id);
  assert.notDeepEqual(
    rerolled.parts.map((p) => p.id),
    first.parts.map((p) => p.id)
  );
});

test('fnv1a sanity: stable known hash values', () => {
  assert.equal(fnv1a(''), 0x811c9dc5);
  assert.equal(fnv1a('a'), 0xe40c292c);
});

test('class derivation: Knight branch and precedence', () => {
  const armor = [
    { slot: 'chest', id: 'chest/platemail', tags: [] },
    { slot: 'shoulders', id: 'shoulders/platemail', tags: [] },
    { slot: 'gloves', id: 'gloves/platemail', tags: [] },
    { slot: 'legs', id: 'legs/chainmail', tags: [] },
  ];
  const base = { slot: 'bases', id: 'bases/lizardman', tags: [] };
  const longsword = { slot: 'weapons', id: 'weapons/steel_longsword', dmgType: 'physical', tags: [] };

  // full armor + longsword + kite shield -> Knight (the Plagueth case)
  const kite = { slot: 'shields', id: 'shields/brass_kite_shield', tags: ['shield'] };
  assert.equal(deriveClass([base, ...armor, longsword, kite]), 'Knight');

  // towershield still -> Tank (precedence over Knight)
  const tower = { slot: 'shields', id: 'shields/spiked_tower_shield', tags: ['shield', 'tank'] };
  assert.equal(deriveClass([base, ...armor, longsword, tower]), 'Tank');

  // tome offhand -> Cleric even if a shield tag somehow coexists
  const taggedTome = { slot: 'offhands', id: 'offhands/tome_of_knowledge', tags: ['cleric', 'shield'] };
  assert.equal(deriveClass([base, ...armor, longsword, taggedTome]), 'Cleric');

  // generator-level: a rolled non-tower shield derives Knight
  let knight = null;
  for (let i = 0; i < 500 && !knight; i++) {
    const f = generateFighter(`knight-${i}`);
    const shield = f.parts.find((p) => p.slot === 'shields');
    if (shield && !/tower|bulwark/.test(shield.id)) knight = f;
  }
  assert.ok(knight, 'expected to roll a non-tower shield within 500 seeds');
  assert.equal(knight.cls, 'Knight');
});

test('distribution tripwire: offhand-empty within 10%-30% over 500 seeded fighters', () => {
  const N = 500;
  let offhandEmpty = 0;
  for (let i = 0; i < N; i++) {
    const f = generateFighter(`band-${i}`);
    const present = new Set(f.parts.map((p) => p.slot));
    if (!present.has('offhands') && !present.has('shields')) offhandEmpty++;
    // off-hand exclusivity: a held item and a shield can never coexist
    assert.ok(
      !(present.has('offhands') && present.has('shields')),
      `fighter band-${i} has both an off-hand item and a shield`
    );
  }
  assert.ok(
    offhandEmpty >= N * 0.1 && offhandEmpty <= N * 0.3,
    `offhand-empty ${offhandEmpty}/${N} outside the 10%-30% band`
  );
});

test('robe rule: robed fighters have no belt/chest/shoulders/legs, keep boots+gloves', () => {
  // robes: 0 -> never empty -> every fighter is robed
  const alwaysRobed = { slotEmptyWeights: { robes: 0 } };
  for (let i = 0; i < 100; i++) {
    const f = generateFighter(`robe-${i}`, { tuning: alwaysRobed });
    const present = new Set(f.parts.map((p) => p.slot));
    assert.ok(present.has('robes'), `robe-${i} should be robed`);
    for (const slot of ['belts', 'chest', 'shoulders', 'legs']) {
      assert.ok(!present.has(slot), `robed fighter robe-${i} must not have ${slot}`);
    }
    assert.ok(present.has('boots'), 'boots are always allowed and required');
    // robe covers chest/shoulders/legs: only a bare-glove gap can grant crit
    assert.ok(f.stats.crit <= 0.02, `robed crit ${f.stats.crit} exceeds the gloves-only gap`);
    assert.notEqual(f.cls, 'Berserker', 'a robe counts as armor coverage');
  }
  // un-robed fighters always wear a belt
  const neverRobed = { slotEmptyWeights: { robes: Number.MAX_SAFE_INTEGER } };
  for (let i = 0; i < 50; i++) {
    const f = generateFighter(`unrobed-${i}`, { tuning: neverRobed });
    assert.ok(f.parts.some((p) => p.slot === 'belts'), `un-robed unrobed-${i} must wear a belt`);
  }
});

test('species stat identity: bases carry archetype blocks, gear scales fighters', () => {
  const byId = new Map(manifest.map((e) => [e.id, e]));
  assert.deepEqual(byId.get('bases/possum').stats, { hp: 60, atk: 10, def: 5, spd: 14 }); // scout
  assert.deepEqual(byId.get('bases/minotaur').stats, { hp: 130, atk: 18, def: 10, spd: 7 }); // brute
  // no more flat "everyone 80/10/8/10": stats must vary across fighters
  const totals = new Set();
  for (let i = 0; i < 50; i++) {
    const f = generateFighter(`scaling-${i}`);
    totals.add(`${f.stats.hp}/${f.stats.atk}/${f.stats.def}/${f.stats.spd}`);
  }
  assert.ok(totals.size > 25, `expected varied stat lines, got ${totals.size} unique of 50`);
});

test('gap-bonus crit progression: 0/2/4/6/8% for 0-4 empty armor slots', () => {
  const BIG = Number.MAX_SAFE_INTEGER;
  const cases = [
    [{}, 0],
    [{ chest: BIG }, 0.02],
    [{ chest: BIG, shoulders: BIG }, 0.04],
    [{ chest: BIG, shoulders: BIG, gloves: BIG }, 0.06],
    [{ chest: BIG, shoulders: BIG, gloves: BIG, legs: BIG }, 0.08],
  ];
  for (const [emptied, expectedCrit] of cases) {
    // 0 = never empty; BIG = always empty — forces the exact gap count.
    // robes stays BIG (always empty) so the robe-coverage rule can't mask gaps.
    const slotEmptyWeights = {
      chest: 0, shoulders: 0, gloves: 0, legs: 0,
      helms: 0, capes: 0, robes: BIG, conditions: 0, offhand: 0,
      ...emptied,
    };
    const f = generateFighter('crit-progression', { tuning: { slotEmptyWeights } });
    assert.equal(f.stats.crit, expectedCrit, `expected crit ${expectedCrit} with ${Object.keys(emptied).length} gaps`);
  }
});

test('UI/engine consistency: displayed stats deep-equal shared deriveStats output', () => {
  const manifestById = new Map(manifest.map((e) => [e.id, e]));
  for (let i = 0; i < 50; i++) {
    const f = generateFighter(`consistency-${i}`);
    // Reconstruct full part objects the way any consumer would, then re-derive
    // through the single shared function.
    const parts = f.parts.map((p) => ({
      ...manifestById.get(p.id),
      slot: p.slot,
      golden: p.golden,
    }));
    const { stats } = deriveStats(parts, tuning);
    assert.deepEqual(stats, f.stats, `stat mismatch for seed consistency-${i}`);
  }
});

test('gear extras: abilities on staff/tome/robe/helm, synergies and resistances derive', async () => {
  const { deriveResistances, deriveSynergies } = await import('../src/gen/compose.mjs');

  // manifest: every robe, helm, staff and tome carries an ability
  for (const e of manifest) {
    const stem = e.id.split('/')[1];
    const shouldHave =
      e.slot === 'robes' ||
      e.slot === 'helms' ||
      (e.slot === 'offhands' && /staff|scepter|smiter|mirror|wand|tome|book/.test(stem));
    if (shouldHave) {
      assert.ok(e.ability?.name && e.ability?.desc, `${e.id} is missing an ability`);
      // action economy: every ability declares a kind and a move cost
      assert.ok(
        ['spell', 'heal', 'buff', 'debuff', 'summon', 'passive'].includes(e.ability.kind),
        `${e.id} ability has invalid kind "${e.ability.kind}"`
      );
      assert.ok(
        Number.isInteger(e.ability.cost) && e.ability.cost >= 0 && e.ability.cost <= 2,
        `${e.id} ability has invalid cost ${e.ability.cost}`
      );
      // passives are free; active abilities consume 1-2 of the turn's moves
      if (e.ability.kind === 'passive') assert.equal(e.ability.cost, 0);
      else assert.ok(e.ability.cost >= 1);
    }
    assert.notEqual(e.name, 'TODO', `${e.id} still has a TODO name`);
    assert.ok(!/^(Chimera|Staff|Items|Tattoo|King) \d+$/.test(e.name), `${e.id} kept placeholder name "${e.name}"`);
  }

  // fighter abilities come exactly from its ability-bearing parts, and every
  // part carries its display name (no raw ids leaking into UIs)
  const byId = new Map(manifest.map((e) => [e.id, e]));
  for (let i = 0; i < 50; i++) {
    const f = generateFighter(`gear-extras-${i}`);
    const expected = f.parts.filter((p) => byId.get(p.id)?.ability).map((p) => p.id);
    assert.deepEqual(f.abilities.map((a) => a.source), expected);
    for (const p of f.parts) {
      assert.ok(p.name && p.name !== 'TODO', `part ${p.id} has no display name`);
    }
  }

  // resistances: frost gear grants frost resist, capped at 40%
  const frostParts = Array.from({ length: 12 }, (_, i) => ({
    slot: 'chest', id: `chest/frostrime_piece_${i}`, tags: [],
  }));
  assert.equal(deriveResistances(frostParts).frost, 0.4);

  // synergies: two same-family pieces form a set; robe + staff = Battlemage
  const syn = deriveSynergies([
    { slot: 'boots', id: 'boots/frostrime', tags: [] },
    { slot: 'gloves', id: 'gloves/frostrime_gloves', tags: [] },
    { slot: 'robes', id: 'robes/summoners_robe', tags: ['robe-ability'] },
    { slot: 'offhands', id: 'offhands/staff_of_fire', tags: ['caster'] },
  ]);
  const names = syn.map((s) => s.name);
  assert.ok(names.includes('Frostrime Set'), `expected Frostrime Set in ${names}`);
  assert.ok(names.includes('Battlemage'), `expected Battlemage in ${names}`);
});

test('sha256 sanity: browser-safe implementation matches node:crypto', async () => {
  const { sha256Hex } = await import('../src/gen/sha256.mjs');
  const crypto = await import('node:crypto');
  const cases = ['', 'abc', 'weapons/steel_longsword\nbases/frogfolk', 'x'.repeat(200), '⚔️ Ωmega'];
  for (let i = 0; i < 100; i++) {
    cases.push(crypto.randomBytes(1 + (i % 90)).toString('base64'));
  }
  for (const s of cases) {
    assert.equal(sha256Hex(s), crypto.createHash('sha256').update(s, 'utf8').digest('hex'));
  }
});
