// Match runner: best-of-3 rounds, 2-0 early exit, drop table, determinism.
// Same masterSeed = byte-identical MatchLog.

import { toUnit, initRound } from './state.mjs';
import { runRound } from './round.mjs';
import { deriveSeed, rngFrom } from './rng.mjs';

// Drop table: winner's odds improve with a cleaner scoreline. Anti-throw
// invariant: a better scoreline never yields worse expected rarity.
const DROP_RARITIES = [
  { rarity: 'common', weight: 60 },
  { rarity: 'rare', weight: 30 },
  { rarity: 'epic', weight: 10 },
];
const DROP_ITEMS = {
  common: ['Longsword', 'Plate Armor', 'Chain Coif', 'Iron Buckler', 'Sturdy Boots'],
  rare: ['Ring of Haste', 'Vampiric Charm', 'Frostrime Band', 'Hunter Sigil'],
  epic: ['Royal Regalia Shard', 'Crystalline Splinter', 'Nexus Fragment'],
};

export function rollDrops(seed, score) {
  const rng = rngFrom(deriveSeed(seed, `drops-${score.A}-${score.B}`));
  const margin = Math.abs(score.A - score.B); // 2-0 sweeps drop better loot
  const table = DROP_RARITIES.map((d) => ({
    ...d,
    weight: d.rarity === 'epic' ? d.weight + margin * 5 : d.weight,
  }));
  const total = table.reduce((s, d) => s + d.weight, 0);
  const drops = [];
  for (let i = 0; i < 3; i++) {
    let roll = rng() * total;
    let rarity = table[table.length - 1].rarity;
    for (const d of table) {
      roll -= d.weight;
      if (roll < 0) {
        rarity = d.rarity;
        break;
      }
    }
    const pool = DROP_ITEMS[rarity];
    drops.push({ item: pool[Math.floor(rng() * pool.length)], rarity });
  }
  return drops;
}

/**
 * Run a full match: two teams of generateFighter() fighters, a master seed.
 * Returns { winner, score, rounds, drops, seed, log }.
 */
export async function runMatch(teamAFighters, teamBFighters, masterSeed) {
  const unitsA = teamAFighters.map((f, i) => toUnit(f, 0, i));
  const unitsB = teamBFighters.map((f, i) => toUnit(f, 1, i));

  const score = { A: 0, B: 0 };
  const rounds = [];
  const log = [];

  for (let roundNum = 1; roundNum <= 3; roundNum++) {
    const state = initRound(unitsA, unitsB, roundNum, masterSeed);
    const result = runRound(state);
    score[result.winner]++;
    rounds.push({ round: roundNum, winner: result.winner, how: result.how });
    log.push(...state.log);
    if (score.A === 2 || score.B === 2) break; // 2-0 early exit
  }

  const winner = score.A > score.B ? 'A' : 'B';
  return {
    seed: String(masterSeed),
    winner,
    score,
    rounds,
    drops: rollDrops(masterSeed, score),
    teams: {
      A: unitsA.map((u) => ({ id: u.id, fighterId: u.fighterId, name: u.name, cls: u.cls, species: u.species })),
      B: unitsB.map((u) => ({ id: u.id, fighterId: u.fighterId, name: u.name, cls: u.cls, species: u.species })),
    },
    log,
  };
}

/** Flatten a match into linear, human-readable turn events for the UI. */
export function formatMatchLog(match) {
  const names = new Map();
  for (const side of ['A', 'B']) {
    for (const u of match.teams[side]) names.set(u.id, u.name);
  }
  const n = (id) => names.get(id) ?? id;

  const lines = [];
  let turn = 0;
  for (const e of match.log) {
    let text = null;
    switch (e.type) {
      case 'round-start': text = `— Round ${e.round} begins —`; break;
      case 'damage': text = `${n(e.unit)} ${e.action === 'dual-strike' ? 'dual-strikes' : 'hits'} ${n(e.target)} for ${e.dmg}`; break;
      case 'cast': text = `${n(e.unit)} casts ${e.ability}${e.target ? ` on ${n(e.target)}` : ''}`; break;
      case 'heal': text = `${n(e.unit)} heals ${e.amount} (${e.source})`; break;
      case 'death': text = `${n(e.unit)} falls!`; break;
      case 'survive': text = `${n(e.unit)} cheats death (${e.how})`; break;
      case 'bloodlust': text = `${n(e.unit)} rages: +${e.heal} HP, +${e.atkStack} ATK (Bloodlust)`; break;
      case 'negate': text = `${n(e.unit)} evades the blow`; break;
      case 'deflect': text = `${n(e.unit)} deflects the hit`; break;
      case 'retaliate': text = `${n(e.unit)} retaliates on ${n(e.target)} for ${e.dmg}`; break;
      case 'dot': text = `${n(e.unit)} suffers ${e.dmg} (${e.effect})`; break;
      case 'familiar': text = `${n(e.unit)}'s ${e.name} chips ${n(e.target)} for ${e.dmg}`; break;
      case 'pact': text = `${n(e.unit)} pays ${e.cost} HP for ${e.mult}x power`; break;
      case 'cleanse': text = `${n(e.unit)} is cleansed (${e.removed} debuffs)`; break;
      case 'round-end': text = `— Round ${e.round}: team ${e.winner} wins (${e.how}) —`; break;
      default: break;
    }
    if (text) {
      turn++;
      lines.push({ turn, round: e.round ?? null, cycle: e.cycle ?? null, event: text, raw: e });
    }
  }
  return lines;
}
