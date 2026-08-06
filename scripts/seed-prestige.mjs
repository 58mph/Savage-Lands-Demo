#!/usr/bin/env node
// Prestige items (BALANCE-FINAL): rare (<4% spawn), overpowered when found.
// Creates tinted placeholder art from existing pieces and bakes manifest
// entries with prestige fx. Idempotent — skips anything already present.
//
//   node scripts/seed-prestige.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { SLOT_Z_INDEX } from '../src/gen/compose-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(ROOT, 'data', 'attributes.json');

// [id, source art to tint, tint rgba, name, stats, ability]
const PRESTIGE = [
  {
    id: 'helms/royal_regalia',
    from: 'assets/helms/chimera_16.png',
    tint: { r: 255, g: 205, b: 60, alpha: 0.5 },
    name: 'Royal Regalia',
    stats: { hp: 8, atk: 2, def: 5, spd: 1 },
    ability: {
      name: 'Royal Regalia',
      desc: '+10% to all stats (applied at generation)',
      kind: 'passive',
      cost: 0,
    },
  },
  {
    id: 'offhands/spell_mastery_tome',
    from: 'assets/offhands/tome_of_knowledge.png',
    tint: { r: 255, g: 205, b: 60, alpha: 0.5 },
    name: 'Tome of Spell Mastery',
    stats: { hp: 6, atk: 4, def: 0, spd: 0 },
    ability: {
      name: 'Spell Mastery',
      desc: 'Your spells deal double damage and heal you for half the damage dealt',
      kind: 'passive',
      cost: 0,
    },
  },
  {
    id: 'offhands/crystalline_focus',
    from: 'assets/offhands/illuminated_staff.png',
    tint: { r: 120, g: 230, b: 255, alpha: 0.5 },
    name: 'Crystalline Focus',
    stats: { hp: 0, atk: 5, def: 0, spd: 1 },
    ability: {
      name: 'Crystalline Focus',
      desc: 'Cast abilities twice per round',
      kind: 'passive',
      cost: 0,
    },
  },
  {
    id: 'offhands/arcane_nexus',
    from: 'assets/offhands/malevolent_ruby.png',
    tint: { r: 200, g: 110, b: 255, alpha: 0.5 },
    name: 'Arcane Nexus',
    stats: { hp: 4, atk: 4, def: 0, spd: 1 },
    ability: {
      name: 'Arcane Nexus',
      desc: 'Spells deal +30% damage and ignore cover',
      kind: 'passive',
      cost: 0,
    },
  },
];

const PRESTIGE_RARITY_WEIGHT = 3; // vs 100 per normal piece -> rare

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const byId = new Map(manifest.map((e) => [e.id, e]));

let created = 0;
for (const item of PRESTIGE) {
  const [slot, stem] = item.id.split('/');
  const file = `assets/${slot}/${stem}.png`;
  const abs = path.join(ROOT, file);

  if (!fs.existsSync(abs)) {
    // gold/crystal-tinted copy of an existing piece, masked to its own alpha
    const src = await sharp(path.join(ROOT, item.from)).ensureAlpha().png().toBuffer();
    const tintLayer = await sharp({
      create: { width: 128, height: 128, channels: 4, background: item.tint },
    })
      .composite([{ input: src, blend: 'dest-in' }])
      .png()
      .toBuffer();
    await sharp(src).composite([{ input: tintLayer, blend: 'over' }]).png().toFile(abs);
  }

  if (!byId.has(item.id)) {
    manifest.push({
      id: item.id,
      slot,
      file,
      name: item.name,
      stats: item.stats,
      dmgType: null,
      tags: ['prestige'],
      ability: item.ability,
      rarityWeight: PRESTIGE_RARITY_WEIGHT,
      golden: true, // prestige art is inherently gilded; no extra tint at render
      zIndex: SLOT_Z_INDEX[slot] ?? 0,
    });
    created++;
  }
}

manifest.sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
console.log(`seed-prestige: ${created} prestige items added (${PRESTIGE.length} total defined)`);
