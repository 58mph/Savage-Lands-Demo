#!/usr/bin/env node
// One-time sorter: copies pixel-art layers from layers/ into the slot layout
// under assets/ that the compositor pipeline (scan-assets, compose, render)
// consumes. Idempotent — re-running only copies files that are missing.
//
// Slot mapping (matches the original Chimera template):
//   bases        <- layers/Base                  (required, 100%)
//   belts        <- layers/Belt                  (required, 100%)
//   boots        <- layers/Boots                 (required, 100%)
//   weapons      <- layers/Sword                 (required main hand, 100%)
//   legs         <- layers/Pant
//   chest        <- layers/Chest
//   shoulders    <- layers/Shoulder
//   gloves       <- layers/Gloves
//   helms        <- layers/Helms
//   capes        <- layers/Capes
//   robes        <- layers/Robes
//   conditions   <- layers/Condition:Enhancement
//   offhands     <- layers/Off_Hand/Items + Off_Hand/Staff  (held items, FRONT layer)
//   shields      <- layers/Shield                            (REAR layer, behind base)
//   shieldstraps <- layers/Shield/ShieldStrap    (front overlay, auto-paired to shield)
//
// Straps are renamed to <shield_stem>_strap.png so the generator can derive a
// shield's strap id deterministically.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SLOT_SOURCES = {
  bases: ['layers/Base'],
  belts: ['layers/Belt'],
  boots: ['layers/Boots'],
  weapons: ['layers/Sword'],
  legs: ['layers/Pant'],
  chest: ['layers/Chest'],
  shoulders: ['layers/Shoulder'],
  gloves: ['layers/Gloves'],
  helms: ['layers/Helms'],
  capes: ['layers/Capes'],
  robes: ['layers/Robes'],
  conditions: ['layers/Condition:Enhancement'],
  offhands: ['layers/Off_Hand/Items', 'layers/Off_Hand/Staff'],
  shields: ['layers/Shield'],
};

function sanitize(filename) {
  const base = filename.replace(/\.png$/i, '');
  return (
    base
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_') + '.png'
  );
}

let copied = 0;
let skipped = 0;

function copyInto(destDir, srcPath, destName) {
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, destName);
  if (fs.existsSync(dest)) {
    skipped++;
    return;
  }
  fs.copyFileSync(srcPath, dest);
  copied++;
}

for (const [slot, sources] of Object.entries(SLOT_SOURCES)) {
  for (const src of sources) {
    const srcDir = path.join(ROOT, src);
    if (!fs.existsSync(srcDir)) {
      console.warn(`warn: source dir missing: ${src}`);
      continue;
    }
    for (const file of fs.readdirSync(srcDir).sort()) {
      if (!file.toLowerCase().endsWith('.png')) continue;
      copyInto(path.join(ROOT, 'assets', slot), path.join(srcDir, file), sanitize(file));
    }
  }
}

// --- Shield straps: pair each strap to its shield by longest common prefix
// (handles naming quirks like "Bloody_Veteran's_Shield" / "Bloddy_Veteran's_Strap"),
// then store as shieldstraps/<shield_stem>_strap.png.
const shieldDir = path.join(ROOT, 'layers', 'Shield');
const strapDir = path.join(shieldDir, 'ShieldStrap');
if (fs.existsSync(strapDir)) {
  const shields = fs.readdirSync(shieldDir).filter((f) => f.endsWith('.png')).sort();
  const straps = fs.readdirSync(strapDir).filter((f) => f.endsWith('.png')).sort();

  const lcp = (a, b) => {
    let i = 0;
    const x = a.toLowerCase();
    const y = b.toLowerCase();
    while (i < x.length && i < y.length && x[i] === y[i]) i++;
    return i;
  };

  const pairs = [];
  const taken = new Set();
  for (const shield of shields) {
    let best = null;
    let bestScore = -1;
    for (const strap of straps) {
      if (taken.has(strap)) continue;
      const score = lcp(shield, strap);
      if (score > bestScore) {
        bestScore = score;
        best = strap;
      }
    }
    if (!best) {
      console.warn(`warn: no strap found for shield ${shield}`);
      continue;
    }
    taken.add(best);
    pairs.push([shield, best]);
  }

  for (const [shield, strap] of pairs) {
    const shieldStem = sanitize(shield).replace(/\.png$/, '');
    copyInto(
      path.join(ROOT, 'assets', 'shieldstraps'),
      path.join(strapDir, strap),
      `${shieldStem}_strap.png`
    );
  }
  console.log('strap pairing:');
  for (const [shield, strap] of pairs) console.log(`  ${shield}  <->  ${strap}`);
}

console.log(`sort-assets: copied ${copied}, skipped ${skipped} (already present)`);
