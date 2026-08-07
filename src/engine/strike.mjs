// Combat kernel: strike resolution + action selection.
// Damage pipeline per SPEC §2 (locked):
//   base -> crit -> first-strike -> execute -> pact -> cover -> resists
//   -> mitigation (DEF * 0.5) -> post-mitigation multipliers (Dual Strike 0.6x,
//      Spell Mastery 2x) -> negation/survival checks -> on-hit effects.

import { effStat, applyEffect } from './state.mjs';
import { makeEffect } from './effects.mjs';

export const DEF_EFF = 0.5; // locked: armor is half-value
export const CRIT_MULT = 2.0; // standard crit (species may override, e.g. Maul 2.5)
export const COVER = { vanguard: 0.4, flank: 0.2 }; // backline damage reduction

const aliveIn = (team, slot) => team.some((u) => u.alive && u.slot === slot);

function coverMult(target, targetTeam) {
  if (target.slot !== 'B') return 0;
  const others = targetTeam.filter((u) => u !== target);
  if (aliveIn(others, 'V')) return COVER.vanguard;
  if (aliveIn(others, 'F')) return COVER.flank;
  return 0;
}

/** Apply damage with negation, Play Dead / Undying, death triggers. */
function applyDamage(attacker, target, dmg, state, events, label, meta = {}) {
  const team = state.teams[target.team];
  const foes = state.teams[attacker.team];

  // negation (Shadowstep, Burrow, Mana Shield)
  if (target.negateNext && dmg > 0) {
    target.negateNext = false;
    events.push({ type: 'negate', unit: target.id, vs: attacker.id, action: label });
    return 0;
  }

  // Bulwark: first hit each round halved
  if (target.fx.firstHitHalved && !target.firstHitTaken && dmg > 0) {
    dmg = Math.round(dmg / 2);
    events.push({ type: 'bulwark', unit: target.id, dmg });
  }

  target.firstHitTaken = true;
  target.struckThisRound = true;
  if (dmg <= 0) return 0;

  target.hp -= dmg;
  attacker.dmgDealt += dmg;
  events.push({ type: 'damage', unit: attacker.id, target: target.id, dmg, action: label, ...meta });

  // Berserker counter-heal: heal back 15% of damage taken while fighting
  if (target.hp > 0 && target.fx.counterHeal) {
    const heal = Math.round(dmg * target.fx.counterHeal);
    if (heal > 0) {
      target.hp = Math.min(target.hpMax, target.hp + heal);
      events.push({ type: 'heal', unit: target.id, amount: heal, source: 'counter-heal' });
    }
  }

  // Second Wind: once per round, heal 20% when dropping below half
  if (
    target.hp > 0 &&
    target.fx.secondWind &&
    !target.secondWindUsed &&
    target.hp < target.hpMax * 0.5
  ) {
    target.secondWindUsed = true;
    const heal = Math.round(target.hpMax * target.fx.secondWind);
    target.hp = Math.min(target.hpMax, target.hp + heal);
    events.push({ type: 'heal', unit: target.id, amount: heal, source: 'Second Wind' });
  }

  if (target.hp <= 0) {
    // Play Dead (possum) / Undying: survive lethal at 20% HP once per round
    if (target.fx.playDead && !target.playedDead) {
      target.playedDead = true;
      target.hp = Math.round(target.hpMax * 0.2);
      events.push({ type: 'survive', unit: target.id, how: 'Play Dead' });
    } else if (target.fx.undying && !target.undyingUsed) {
      target.undyingUsed = true;
      target.hp = Math.round(target.hpMax * 0.2);
      events.push({ type: 'survive', unit: target.id, how: 'Undying' });
    } else {
      target.alive = false;
      events.push({ type: 'death', unit: target.id, by: attacker.id });

      // Bloodlust (Berserker): heal 35% max HP + stacking +4 ATK on kill
      if (attacker.fx.bloodlust && attacker.alive) {
        const heal = Math.round(attacker.hpMax * attacker.fx.bloodlust.healFrac);
        attacker.hp = Math.min(attacker.hpMax, attacker.hp + heal);
        attacker.atkStacks += attacker.fx.bloodlust.atkStack;
        events.push({ type: 'bloodlust', unit: attacker.id, heal, atkStack: attacker.fx.bloodlust.atkStack });
      }
      // onEnemyDown heals for the killer's living allies
      for (const ally of foes) {
        if (ally.alive && ally.fx.onEnemyDownHeal) {
          ally.hp = Math.min(ally.hpMax, ally.hp + ally.fx.onEnemyDownHeal);
          events.push({ type: 'heal', unit: ally.id, amount: ally.fx.onEnemyDownHeal, source: 'on-kill' });
        }
      }
    }
  }

  // retaliation (Toxic Skin, Burning Blood, Thorns, Reflect)
  if (attacker.alive && target.alive !== false) {
    const retaliate =
      (target.fx.retaliateFlat ?? 0) + Math.round(dmg * (target.fx.retaliateFrac ?? 0));
    if (retaliate > 0 && !attacker.fx.chipImmune) {
      attacker.hp -= retaliate;
      events.push({ type: 'retaliate', unit: target.id, target: attacker.id, dmg: retaliate });
      if (attacker.hp <= 0) {
        attacker.alive = false;
        events.push({ type: 'death', unit: attacker.id, by: target.id });
      }
    }
  }
  return dmg;
}

/**
 * One weapon strike. multiplier: 1.0 main strike, 0.6 Dual Strike
 * (applied POST-mitigation, locked).
 */
export function resolveStrike(attacker, target, state, rng, multiplier = 1.0) {
  const events = [];
  const isRanged = attacker.dmgType === 'ranged';

  // base roll
  let dmg = effStat(attacker, 'atk') * (0.85 + rng() * 0.3);

  // crit
  let critChance = attacker.crit;
  if (attacker.strikesMade === 0) {
    critChance += attacker.fx.firstStrikeCrit ?? 0;
    if (attacker.fx.firstStrikeGuaranteedCrit) critChance = 1;
  }
  const crit = rng() < critChance;
  if (crit) dmg *= attacker.fx.critMult ?? CRIT_MULT;

  // first-strike bonus (Ambush +60%, Charge +40%, Burrow +80%)
  if (attacker.strikesMade === 0 && attacker.fx.firstStrikeBonus) {
    dmg *= 1 + attacker.fx.firstStrikeBonus;
  }
  if (attacker.nextStrikeBonus) {
    dmg *= 1 + attacker.nextStrikeBonus;
    attacker.nextStrikeBonus = 0;
  }

  // execute (Death Roll, Bite Down) vs targets below half HP
  if (attacker.fx.executeBonus && target.hp < target.hpMax * 0.5) {
    dmg *= 1 + attacker.fx.executeBonus;
  }

  // Dark Pact
  if (attacker.pactMult !== 1) {
    dmg *= attacker.pactMult;
    attacker.pactMult = 1;
  }

  // class-wide damage multiplier (Battlemage weapon+caster synergy +15%)
  dmg *= attacker.fx.dmgMult ?? 1;

  // cover: ranged strikes into the backline are reduced while cover holds
  if (isRanged && !attacker.fx.ignoreCover) {
    dmg *= 1 - coverMult(target, state.teams[target.team]);
  }

  // resistances
  dmg *= 1 - (isRanged ? target.fx.rangedSpellRes ?? 0 : target.fx.physRes ?? 0);

  // mitigation — DEF at half value (locked), then post-mitigation multiplier
  dmg = Math.max(1, dmg - effStat(target, 'def') * DEF_EFF);
  dmg = Math.round(dmg * multiplier);

  // Deflect: chance to ignore a physical hit entirely
  if (!isRanged && target.fx.deflectChance && rng() < target.fx.deflectChance) {
    events.push({ type: 'deflect', unit: target.id, vs: attacker.id });
    attacker.strikesMade++;
    return { dmg: 0, crit, negated: true, targetAlive: target.alive, events };
  }

  const dealt = applyDamage(attacker, target, dmg, state, events,
    multiplier < 1 ? 'dual-strike' : 'attack', { crit });
  attacker.strikesMade++;

  if (dealt > 0 && attacker.alive) {
    // lifesteal (Berserker 50%, vampiric gear 30%)
    let vamp = attacker.fx.vamp ?? 0;
    if (!vamp && attacker.dmgTypes?.includes('physical') && attacker.fx.vampiric) vamp = 0.3;
    if (vamp > 0) {
      const heal = Math.round(dealt * vamp);
      attacker.hp = Math.min(attacker.hpMax, attacker.hp + heal);
      events.push({ type: 'heal', unit: attacker.id, amount: heal, source: 'lifesteal' });
    }
    // on-hit riders
    if (attacker.fx.onHitBonus && target.alive) {
      applyDamage(attacker, target, attacker.fx.onHitBonus, state, events, 'on-hit');
    }
    if (attacker.fx.onHitSapAtk && target.alive) {
      applyEffect(target, makeEffect({ name: 'sap', stat: 'atk', amount: -attacker.fx.onHitSapAtk, polarity: 'debuff' }));
      events.push({ type: 'effect', unit: target.id, effect: 'sap', amount: -attacker.fx.onHitSapAtk });
    }
  }

  return { dmg: dealt, crit, negated: dealt === 0, targetAlive: target.alive, events };
}

/** Spell damage: flat amount, cover + rangedSpellRes apply, DEF does not. */
export function resolveSpellHit(caster, target, spell, state, rng, events) {
  let dmg = spell.amount;
  dmg *= caster.fx.spellDmgMult ?? 1; // Arcane Nexus +30%
  if (!caster.fx.ignoreCover && !spell.ignoreRes) {
    dmg *= 1 - coverMult(target, state.teams[target.team]);
  }
  if (!spell.ignoreRes) dmg *= 1 - (target.fx.rangedSpellRes ?? 0);
  if (spell.ignoreDef) {
    /* Mind Spike: no mitigation anyway — spells skip DEF by design */
  }
  if (caster.fx.spellMastery) dmg *= 2; // post-mitigation x2 (locked)
  dmg = Math.max(1, Math.round(dmg));

  const dealt = applyDamage(caster, target, dmg, state, events, spell.name ?? 'spell');
  if (dealt > 0 && caster.alive) {
    if (caster.fx.spellMastery) {
      const heal = Math.round(dealt * 0.5); // Spell Mastery vamp 50%
      caster.hp = Math.min(caster.hpMax, caster.hp + heal);
      events.push({ type: 'heal', unit: caster.id, amount: heal, source: 'spell-vamp' });
    }
    if (spell.vamp) {
      const heal = Math.round(dealt * spell.vamp);
      caster.hp = Math.min(caster.hpMax, caster.hp + heal);
      events.push({ type: 'heal', unit: caster.id, amount: heal, source: spell.name });
    }
    if (spell.sapAtk && target.alive) {
      applyEffect(target, makeEffect({ name: spell.name, stat: 'atk', amount: -spell.sapAtk, polarity: 'debuff' }));
    }
    if (spell.dot && target.alive && !target.fx.dotImmune) {
      applyEffect(target, makeEffect({ name: `${spell.name} (dot)`, dot: spell.dot, decay: 'per-turn', ticks: 3, polarity: 'debuff' }));
    }
  }
  return dealt;
}

// ---------------------------------------------------------------------------
// Targeting. Melee must chew through the front rows; ranged/spell reach
// anywhere (cover applies). Priority: below-half-HP > lowest HP.
export function pickTarget(attacker, foes, { reachBack = false } = {}) {
  const alive = foes.filter((u) => u.alive);
  if (alive.length === 0) return null;

  const frontmost = () => {
    for (const row of ['V', 'F', 'B']) {
      const inRow = alive.filter((u) => u.slot === row);
      if (inRow.length > 0) return inRow;
    }
    return alive;
  };

  let candidates;
  if (reachBack) {
    // ranged: finish wounded targets anywhere, otherwise avoid wasting
    // shots into cover — work the front line like everyone else
    const hurtAnywhere = alive.filter((u) => u.hp < u.hpMax * 0.5);
    candidates = hurtAnywhere.length > 0 ? hurtAnywhere : frontmost();
  } else {
    candidates = frontmost();
  }
  const hurt = candidates.filter((u) => u.hp < u.hpMax * 0.5);
  const pool = hurt.length > 0 ? hurt : candidates;
  return pool.reduce((low, u) => (u.hp < low.hp ? u : low), pool[0]);
}

// ---------------------------------------------------------------------------
// Action selection: ONE action per turn (locked). Cast replaces attack;
// each ability once per round (doubleAction: twice).

function maxCasts(unit) {
  return unit.fx.doubleAction ? 2 : 1;
}

function pickAbility(unit, allies, foes, state) {
  const usable = unit.actions.filter((a) => (unit.abilityUsed[a.name] ?? 0) < maxCasts(unit));

  // healing has top priority whenever an ally is genuinely hurt
  const hurtAlly = allies.filter((u) => u.alive && u.hp < u.hpMax * 0.65)
    .sort((a, b) => a.hp / a.hpMax - b.hp / b.hpMax)[0];
  const healAction = usable.find((a) => a.usage === 'heal');
  if (hurtAlly && healAction) return { action: healAction, target: hurtAlly };
  // Cleric role heal: available every turn even without a tome ability
  if (hurtAlly && unit.fx.roleHealer) return { action: { name: 'Heal', usage: 'heal' }, target: hurtAlly };

  const brew = usable.find((a) => a.usage === 'brew');
  if (brew && unit.hp < unit.hpMax * brew.threshold) return { action: brew, target: unit };

  // cleanse: strip the worst debuff from the most-debuffed ally (Cleric)
  if (unit.fx.roleHealer) {
    const debuffed = allies.filter(
      (u) => u.alive && u.effects.some((e) => e.polarity === 'debuff' && Math.abs(e.amount) >= 3)
    )[0];
    if (debuffed) return { action: { name: 'Cleanse', usage: 'cleanse' }, target: debuffed };
  }

  // otherwise: fire off remaining actives early in the round (cycle 1-2)
  if (state.cycle <= 2 && usable.length > 0) {
    const offensive = usable.find((a) => ['aoe', 'spell', 'debuff', 'familiar'].includes(a.usage));
    const pact = usable.find((a) => a.usage === 'pact');
    const buff = usable.find((a) => ['selfBuff', 'teamBuff', 'negate', 'burrow'].includes(a.usage));
    const chosen = offensive ?? (unit.hp > unit.hpMax * 0.5 ? pact : null) ?? buff;
    if (chosen) {
      const target = ['debuff', 'spell'].includes(chosen.usage)
        ? pickTarget(unit, foes, { reachBack: true })
        : unit;
      if (chosen.usage === 'debuff') {
        // highest-ATK foe
        const alive = foes.filter((u) => u.alive);
        const top = alive.sort((a, b) => effStat(b, 'atk') - effStat(a, 'atk'))[0];
        return { action: chosen, target: top ?? null };
      }
      return { action: chosen, target };
    }
  }
  return null;
}

function castAbility(unit, choice, allies, foes, state, rng) {
  const { action, target } = choice;
  const untargeted = ['aoe', 'familiar', 'teamBuff', 'selfBuff', 'negate', 'burrow', 'brew', 'pact'];
  const events = [{
    type: 'cast',
    unit: unit.id,
    ability: action.name,
    target: untargeted.includes(action.usage) ? null : target?.id ?? null,
  }];
  unit.abilityUsed[action.name] = (unit.abilityUsed[action.name] ?? 0) + 1;

  switch (action.usage) {
    case 'selfBuff': {
      if (action.stat) applyEffect(unit, makeEffect({ name: action.name, stat: action.stat, amount: action.amount }));
      if (action.rangedSpellRes) unit.fx.rangedSpellRes = (unit.fx.rangedSpellRes ?? 0) + action.rangedSpellRes;
      if (action.retaliateFrac) unit.fx.retaliateFrac = (unit.fx.retaliateFrac ?? 0) + action.retaliateFrac;
      if (action.retaliateFlat) unit.fx.retaliateFlat = (unit.fx.retaliateFlat ?? 0) + action.retaliateFlat;
      break;
    }
    case 'teamBuff': {
      for (const ally of allies) {
        if (ally.alive) applyEffect(ally, makeEffect({ name: action.name, stat: action.stat, amount: action.amount }));
      }
      break;
    }
    case 'debuff': {
      if (target) {
        applyEffect(target, makeEffect({ name: action.name, stat: action.stat, amount: action.amount, polarity: 'debuff' }));
        if (action.stat2) applyEffect(target, makeEffect({ name: action.name, stat: action.stat2, amount: action.amount2, polarity: 'debuff' }));
      }
      break;
    }
    case 'heal': {
      // Cleric formula (locked): 8 + 0.45*atk + rng*5
      const amount = Math.round(8 + 0.45 * effStat(unit, 'atk') + rng() * 5);
      const targets = action.team ? allies.filter((u) => u.alive) : [target];
      for (const t of targets) {
        if (!t) continue;
        const heal = action.team ? Math.round(amount * 0.6) : amount;
        t.hp = Math.min(t.hpMax, t.hp + heal);
        events.push({ type: 'heal', unit: t.id, amount: heal, source: action.name });
      }
      break;
    }
    case 'cleanse': {
      if (target) {
        const before = target.effects.length;
        target.effects = target.effects.filter((e) => e.polarity !== 'debuff');
        events.push({ type: 'cleanse', unit: target.id, removed: before - target.effects.length });
      }
      break;
    }
    case 'aoe': {
      for (const foe of foes.filter((u) => u.alive)) {
        resolveSpellHit(unit, foe, { ...action, name: action.name }, state, rng, events);
      }
      break;
    }
    case 'spell': {
      if (target) resolveSpellHit(unit, target, { ...action, name: action.name }, state, rng, events);
      break;
    }
    case 'pact': {
      const cost = Math.round(unit.hpMax * action.hpCost);
      unit.hp = Math.max(1, unit.hp - cost);
      unit.pactMult = action.mult;
      events.push({ type: 'pact', unit: unit.id, cost, mult: action.mult });
      break;
    }
    case 'negate': {
      unit.negateNext = true;
      break;
    }
    case 'burrow': {
      unit.negateNext = true;
      unit.nextStrikeBonus = action.nextStrikeBonus;
      break;
    }
    case 'brew': {
      unit.hp = Math.min(unit.hpMax, unit.hp + action.amount); // fixed 30, per docs
      applyEffect(unit, makeEffect({ name: action.name, stat: 'def', amount: -action.defPenalty, polarity: 'debuff' }));
      events.push({ type: 'heal', unit: unit.id, amount: action.amount, source: action.name });
      break;
    }
    case 'familiar': {
      unit.familiars.push({ dmgPerCycle: action.dmgPerCycle, name: action.name });
      break;
    }
  }
  return events;
}

/**
 * One action per turn (locked). Ability replaces attack; the default attack
 * includes the Dual Strike follow-up when the off-hand is bare.
 */
export function resolveAction(unit, state, rng) {
  const allies = state.teams[unit.team];
  const foes = state.teams[1 - unit.team];
  const events = [];

  const choice = pickAbility(unit, allies, foes, state);
  if (choice && (choice.target || ['negate', 'burrow', 'familiar', 'teamBuff', 'selfBuff'].includes(choice.action.usage))) {
    unit.abilityCasts++;
    events.push(...castAbility(unit, choice, allies, foes, state, rng));
    return { action: 'cast', events };
  }

  const reachBack = unit.dmgType === 'ranged';
  const target = pickTarget(unit, foes, { reachBack });
  if (!target) return { action: 'idle', events };

  const main = resolveStrike(unit, target, state, rng, 1.0);
  events.push(...main.events);

  // Dual Strike: bare off-hand -> second swing at 0.6x post-mitigation
  if (unit.doubleAttack && unit.alive) {
    const second = pickTarget(unit, foes, { reachBack });
    if (second) {
      const dual = resolveStrike(unit, second, state, rng, 0.6);
      events.push(...dual.events);
    }
  }
  return { action: 'attack', target: target.id, events };
}
