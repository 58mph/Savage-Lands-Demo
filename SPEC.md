# SPEC — Savage Arena Fighter Compositor & Combat Rules (LOCKED)

The authoritative rules for fighter generation and combat. §1–§6 are the
locked combat design the engine (`src/engine/`) implements; §7+ cover the
generator. Everything is either enforced by shared code
(`src/gen/compose-core.mjs`, `src/engine/`) or defined as data in
`data/tuning.json` / `data/attributes.json`.

## §1. Turn model — one action per turn (LOCKED)

- Every fighter takes **one action per turn**. Speed changes queue position,
  never action count.
- Initiative: `d20 + SPD` per round; ties break to higher SPD, then a
  deterministic flip.
- A round runs at most **12 cycles** (each living unit acts once per cycle).
- Actions:
  - **Attack** (default): strike the highest-priority target. If the
    off-hand is bare, the attack includes the **Dual Strike** follow-up —
    a second swing at `secondAttackMultiplier` (0.6), applied
    **post-mitigation**.
  - **Cast**: an ability replaces the attack. Each ability is usable
    **once per round** (doubleAction effects: twice). Passives are always on
    and never consume the action.

## §2. Strike resolution (LOCKED)

Damage pipeline, in order:

1. Base: `ATK * (0.85 + rng() * 0.3)`
2. Crit: `rng() < crit` → ×2.0 (species may override, e.g. Maul ×2.5;
   first-strike crit bonuses apply to a fighter's first swing of the round)
3. First-strike bonus (Ambush +60%, Charge +40%, Burrow +80%) on the
   fighter's first swing of the round
4. Execute bonus (Death Roll, Bite Down) vs targets below 50% HP
5. Dark Pact multiplier (×2, consumed on use)
6. Cover (ranged/spell into the backline only): −40% while a vanguard
   stands, −20% with only flankers, 0% once the front is gone
7. Resistances: `physRes` vs physical, `rangedSpellRes` vs ranged/spell
8. Mitigation: `dmg -= DEF * 0.5` (**DEF effectiveness 0.5, locked**),
   floor 1
9. Post-mitigation multipliers: Dual Strike ×0.6, Spell Mastery ×2 (spells)

Spells (flat-amount abilities) skip DEF mitigation; cover and
`rangedSpellRes` still apply. Radiant Burst is **flat 20 AoE** (locked —
scaling it broke Cleric at 85%+ winrate).

On-hit: lifesteal (Berserker 50%, Spell Mastery 50% on spells), Ignite
flat bonus, Chill Touch ATK sap, retaliation (Toxic Skin, Burning Blood,
Thorns — back at the attacker), Bulwark (first hit each round halved).

Survival: Shadowstep/Burrow/Mana Shield negate the next hit; Play Dead
(possum) and Undying survive one lethal blow per round at 20% HP.

Death triggers: Bloodlust (Berserker kill → heal 35% max HP + stacking
+4 ATK), on-kill ally heals (Scavenge).

## §3. Formation & targeting

Slots: **V** (vanguard), **F** (flank), **B** (backline). Tanks/Knights
anchor the vanguard; Wizards, Clerics, Archers and Battlemages sit in the
backline; everyone else flanks. Every team keeps at least one body up front.

Targeting priority: melee works the frontmost living row; ranged finishes
wounded targets anywhere (below-half-HP first), otherwise also works the
front. Within candidates: below-half-HP > lowest HP.

## §4. Round end & timeout (LOCKED)

A round ends on a wipe, or after 12 cycles by the timeout hierarchy:
**downs > damage > flip** (fewer dead wins; then total damage dealt; then a
deterministic coin flip). Effects never persist across rounds — every
effect decays per-turn/per-round or dies with its source.

## §5. Match structure

Best-of-3 rounds with **2-0 early exit**. Round seeds derive from the
master seed (`hash(master + round)`); every rng() call is seeded — same
seed = byte-identical MatchLog. The drop table rewards the winner; the
anti-throw invariant holds: a cleaner scoreline never yields worse expected
loot.

## §6. Class kits, species passives, prestige

- **Berserker** (locked fixes): +3 DEF per empty armor slot, 50% lifesteal
  on every attack, 15% counter-heal on damage taken, Bloodlust on kill.
  High-risk carry — needs a Cleric.
- **Battlemage**: melee weapon + caster off-hand; +15% all damage and casts
  twice per round.
- **Cleric**: role healer — may spend any turn healing the most wounded
  ally below 65% HP (`8 + 0.45*ATK + rng*5`), and cleanses debuffs
  (polarity field decides; cleanse never strips buffs).
- **Knight**: off-tank, +8% physical resistance. **Rogue**: +4% crit.
- Species passives: Maul (minotaur ×2.5 crit), Play Dead (possum),
  Death Roll (crocodillian), Ambush (black ratman), Charge (lizardman),
  Cunning (raccoon), Toxic Skin (poisonous frogfolk), Burning Blood
  (salamander), Slippery (frogfolk), Thick Hide (bearkin), Frosthide
  (winter bearkin), Scavenger (brown ratman), Plaguebearer (white ratman),
  Spirit Ward (albino crocodillian).
- **Prestige items** (rare, <4% spawn, OP when found): Royal Regalia
  (+10% all stats, applied at generation), Tome of Spell Mastery (×2 spell
  damage + 50% spell vamp), Crystalline Focus (double action), Arcane Nexus
  (+30% spell damage, ignores cover).

## §7. Slots & spawn rules (generator)

15 layers, z-order front→back: Sword, Shoulder, Helm, Off Hand, Belt,
ShieldStrap, Gloves, Robes, Boots, Chest, Pant, Condition, Base, Shield,
Capes. Shields render behind the base (far hand), their strap in front.
Per-piece `zIndex` in the manifest overrides the slot default.

- **Always present:** Base, Boots, Main Hand. Belt is always present
  **unless the fighter wears a robe**.
- **Robe exclusivity:** a robed fighter has no belt, no chest, no
  shoulders, no pants. Boots and gloves are allowed. The robe counts as
  chest/shoulders/legs coverage for crit gaps and the Berserker check.
- **Off-hand exclusivity:** one roll across EMPTY | held item (staff, tome,
  trinket) | shield (+ its paired strap). Never two off-hand things.
- **Berserker roll** (`tuning.berserkerChance`): a small chance the fighter
  spawns with the bare-armor loadout, giving the archetype a real spawn rate.
- All other slots roll EMPTY per `tuning.slotEmptyWeights`.

## §8. Stat derivation (single source: `deriveStats`)

- Fighter stats = sum of all part stats (species base + gear).
- Golden pieces ×`goldenStatMultiplier` (1.1) before summing.
- **Crit gaps:** +2% per empty armor slot (chest/shoulders/gloves/legs),
  max +8%. Robes cover chest/shoulders/legs.
- Resistances: +5% per themed gear piece (fire/frost/poison/shadow/holy),
  cap 40%. Synergies: 2+ same-family pieces, Battlemage/Bloodpact/Spellblade
  combos.

## §9. Classes (derived label, first match wins)

towershield → **Tank** · tome off-hand → **Cleric** · staff off-hand +
robe → **Wizard** · staff off-hand + armor → **Battlemage** · ranged
weapon → **Archer** · any other shield → **Knight** · zero armor and no
robe → **Berserker** · else **Rogue**. Shield detection is tag-based.

## §10. Identity & determinism (consensus-critical)

- `fighter.id = sha256(sorted part-id list)`. Same parts = same fighter,
  everywhere, forever. Class, stats, abilities are derived and never hashed.
- Same seed → identical fighter object and byte-identical PNG (mulberry32
  over a 32-bit FNV-1a hash of the seed).
- **After launch, roll order and outcome space in `rollParts` — and every
  rng() call site in the engine — are frozen.** Any change requires a
  generation-version bump.

## §11. Asset fallback rule

If an asset file referenced by the manifest is missing, renderers draw a
labeled placeholder rectangle for that layer instead of throwing. The
manifest flags disappeared files with `missing: true` and excludes them
from rolls.

## §12. Data files

- `data/tuning.json` — every tunable (spawn weights, golden chance, crit
  per gap, Dual Strike multiplier, combat constants). Never inline.
- `data/attributes.json` — per-part stats, names, tags, abilities
  (`{name, desc, kind, cost}`), rarity weights, zIndex, golden flags.
  Scanner and bake scripts never overwrite human-edited values.
