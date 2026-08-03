#!/usr/bin/env node
// Step 4 — Contact sheet eyeball test.
//
//   node scripts/contact-sheet.mjs --seed test --count 50
//
// Generates N fighters from derived seeds (hash(seed + index)), renders each
// as a captioned card and tiles them into generated/contact-sheet.png.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { generateFighter, fnv1a } from '../src/gen/compose.mjs';
import { renderCard, CARD } from '../src/gen/render.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = { seed: 'test', count: 50, out: 'generated/contact-sheet.png' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--seed') args.seed = argv[++i];
    else if (argv[i] === '--count') args.count = parseInt(argv[++i], 10);
    else if (argv[i] === '--out') args.out = argv[++i];
  }
  return args;
}

const { seed, count, out } = parseArgs(process.argv.slice(2));

const existingIds = new Set();
const cards = [];
for (let i = 0; i < count; i++) {
  const derivedSeed = fnv1a(seed + i).toString(16).padStart(8, '0');
  const fighter = generateFighter(derivedSeed, { existingIds });
  existingIds.add(fighter.id);
  cards.push(await renderCard(fighter));
  process.stdout.write(`\rrendered ${i + 1}/${count}`);
}
process.stdout.write('\n');

const cols = Math.min(10, count);
const rows = Math.ceil(count / cols);
const pad = 8;
const sheetW = cols * (CARD.width + pad) + pad;
const sheetH = rows * (CARD.height + pad) + pad;

const composites = cards.map((buf, i) => ({
  input: buf,
  left: pad + (i % cols) * (CARD.width + pad),
  top: pad + Math.floor(i / cols) * (CARD.height + pad),
}));

const outPath = path.join(ROOT, out);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
await sharp({
  create: { width: sheetW, height: sheetH, channels: 4, background: { r: 14, g: 11, b: 18, alpha: 1 } },
})
  .composite(composites)
  .png()
  .toFile(outPath);

console.log(`contact sheet: ${count} fighters -> ${out} (${sheetW}x${sheetH})`);
