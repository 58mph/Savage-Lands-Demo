#!/usr/bin/env node
// Browser-facing demo for the fighter compositor.
//
//   npm run demo        (then open http://localhost:4173)
//
// Serves demo/index.html and three API routes that reuse the exact
// generator/renderer pipeline, so what you see in the browser is the same
// byte-identical output the headless engine gets:
//
//   GET /api/fighter?seed=<seed>     fighter JSON
//   GET /api/card.png?seed=<seed>    300x400 card PNG
//   GET /api/sprite.png?seed=<seed>  128x128 sprite PNG (transparent)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateFighter } from '../src/gen/compose.mjs';
import { renderFighter, renderCard } from '../src/gen/render.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 4173);

// Deterministic output -> cache by seed. Bounded so a long session can't
// grow memory forever.
const MAX_CACHE = 500;
const cache = new Map();
function cached(key, make) {
  if (cache.has(key)) {
    const value = cache.get(key);
    cache.delete(key);
    cache.set(key, value); // refresh LRU position
    return value;
  }
  const value = make();
  cache.set(key, value);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  return value;
}

function send(res, status, body, type) {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const seed = url.searchParams.get('seed') ?? 'test';

    if (url.pathname === '/' || url.pathname === '/index.html') {
      const html = fs.readFileSync(path.join(ROOT, 'demo', 'server.html'));
      return send(res, 200, html, 'text/html; charset=utf-8');
    }

    if (url.pathname === '/api/fighter') {
      const fighter = cached(`f:${seed}`, () => generateFighter(seed));
      return send(res, 200, JSON.stringify(fighter), 'application/json');
    }

    if (url.pathname === '/api/card.png') {
      const fighter = cached(`f:${seed}`, () => generateFighter(seed));
      const png = await cached(`c:${seed}`, () => renderCard(fighter));
      return send(res, 200, png, 'image/png');
    }

    if (url.pathname === '/api/sprite.png') {
      const fighter = cached(`f:${seed}`, () => generateFighter(seed));
      const png = await cached(`s:${seed}`, () => renderFighter(fighter));
      return send(res, 200, png, 'image/png');
    }

    send(res, 404, JSON.stringify({ error: 'not found' }), 'application/json');
  } catch (err) {
    console.error(err);
    send(res, 500, JSON.stringify({ error: String(err.message ?? err) }), 'application/json');
  }
});

server.listen(PORT, () => {
  console.log(`fighter compositor demo -> http://localhost:${PORT}`);
});
