// Round loop: initiative order, max 12 cycles, timeout hierarchy
// downs > damage > flip (locked).

import { resolveAction } from './strike.mjs';
import { tickEffects, effStat } from './state.mjs';

export const MAX_CYCLES = 12;

const teamAlive = (team) => team.some((u) => u.alive);
const downs = (team) => team.filter((u) => !u.alive).length;
const totalDmg = (team) => team.reduce((s, u) => s + u.dmgDealt, 0);

/** Run one round on an initRound() state. Mutates units; returns result. */
export function runRound(state) {
  const [teamA, teamB] = state.teams;
  const log = state.log;

  log.push({
    type: 'round-start',
    round: state.round,
    order: state.order.map((u) => u.id),
  });

  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
    state.cycle = cycle;
    log.push({ type: 'cycle', round: state.round, cycle });

    for (const unit of state.order) {
      if (!unit.alive) continue;
      const foes = state.teams[1 - unit.team];
      if (!teamAlive(foes)) break;

      const result = resolveAction(unit, state, state.rng);
      for (const e of result.events) log.push({ round: state.round, cycle, actor: unit.id, ...e });

      // per-turn effect ticks (dots) on the acting unit
      for (const e of tickEffects(unit, 'per-turn')) log.push({ round: state.round, cycle, ...e });

      if (!teamAlive(teamA) || !teamAlive(teamB)) break;
    }

    // familiars chip a random living foe each cycle
    for (const unit of state.order) {
      if (!unit.alive || unit.familiars.length === 0) continue;
      const foes = state.teams[1 - unit.team].filter((u) => u.alive);
      if (foes.length === 0) continue;
      for (const fam of unit.familiars) {
        const target = foes[Math.floor(state.rng() * foes.length)];
        target.hp -= fam.dmgPerCycle;
        unit.dmgDealt += fam.dmgPerCycle;
        log.push({ type: 'familiar', round: state.round, cycle, unit: unit.id, target: target.id, dmg: fam.dmgPerCycle, name: fam.name });
        if (target.hp <= 0 && target.alive) {
          target.alive = false;
          log.push({ type: 'death', round: state.round, cycle, unit: target.id, by: fam.name });
        }
      }
    }

    if (!teamAlive(teamA) || !teamAlive(teamB)) {
      const winner = teamAlive(teamA) ? 'A' : 'B';
      log.push({ type: 'round-end', round: state.round, winner, how: 'wipe' });
      return { winner, how: 'wipe', log };
    }

    // per-round effects tick down at the end of each full cycle
    for (const unit of [...teamA, ...teamB]) {
      if (!unit.alive) continue;
      for (const e of tickEffects(unit, 'per-round')) log.push({ round: state.round, cycle, ...e });
    }
  }

  // Timeout hierarchy (locked): downs > damage > flip
  let winner;
  let how;
  const dA = downs(teamA);
  const dB = downs(teamB);
  if (dA !== dB) {
    winner = dA < dB ? 'A' : 'B';
    how = 'timeout-downs';
  } else {
    const dmgA = totalDmg(teamA);
    const dmgB = totalDmg(teamB);
    if (dmgA !== dmgB) {
      winner = dmgA > dmgB ? 'A' : 'B';
      how = 'timeout-dmg';
    } else {
      winner = state.rng() < 0.5 ? 'A' : 'B';
      how = 'timeout-flip';
    }
  }
  log.push({ type: 'round-end', round: state.round, winner, how });
  return { winner, how, log };
}

export { effStat };
