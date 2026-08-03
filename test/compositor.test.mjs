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
