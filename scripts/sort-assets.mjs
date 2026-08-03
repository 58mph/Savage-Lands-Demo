#!/usr/bin/env node
// One-time sorter: copies pixel-art layers from layers/ into the slot layout
// under assets/ that the compositor pipeline (scan-assets, compose, render)
// consumes. Idempotent — re-running only copies files that are missing.
//
// Slot mapping:
//   bases     <- layers/Base
//   chest     <- layers/Chest
//   shoulders <- layers/Shoulder
//   gloves    <- layers/Gloves
//   legs      <- layers/Pant
//   weapons   <- layers/Sword + layers/Off_Hand/Staff  (staves are main-hand weapons)
//   offhands  <- layers/Shield + layers/Off_Hand/Items (shields, tomes, trinkets)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SLOT_SOURCES = {
  bases: ['layers/Base'],
  chest: ['layers/Chest'],
  shoulders: ['layers/Shoulder'],
  gloves: ['layers/Gloves'],
  legs: ['layers/Pant'],
  weapons: ['layers/Sword', 'layers/Off_Hand/Staff'],
  offhands: ['layers/Shield', 'layers/Off_Hand/Items'],
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

for (const [slot, sources] of Object.entries(SLOT_SOURCES)) {
  const destDir = path.join(ROOT, 'assets', slot);
  fs.mkdirSync(destDir, { recursive: true });

  for (const src of sources) {
    const srcDir = path.join(ROOT, src);
    if (!fs.existsSync(srcDir)) {
      console.warn(`warn: source dir missing: ${src}`);
      continue;
    }
    for (const file of fs.readdirSync(srcDir).sort()) {
      if (!file.toLowerCase().endsWith('.png')) continue;
      const dest = path.join(destDir, sanitize(file));
      if (fs.existsSync(dest)) {
        skipped++;
        continue;
      }
      fs.copyFileSync(path.join(srcDir, file), dest);
      copied++;
    }
  }
}

console.log(`sort-assets: copied ${copied}, skipped ${skipped} (already present)`);
