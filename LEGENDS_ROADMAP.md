# 🏰 THE SAVAGE LANDS: LEGENDS
## Procedural World Simulation Roadmap

*"A thousand years of history, generated in minutes. Empires rise. Heroes fall. Legends are born."*

---

## Overview

Inspired by Dwarf Fortress's Legends Mode, this system generates a living world with thousands of agents, factions, wars, and historical events. The current Savage Arena skirmish system becomes the **conflict resolution engine** for battles.

---

## Phase 1: World Foundation

### 1.1 Geography Generation
- [ ] Procedural map (hex or tile-based)
- [ ] Terrain types: Mountains, Forests, Plains, Swamps, Coasts
- [ ] Resources: Gold, Iron, Mana Crystals, Farmland
- [ ] Strategic locations: Chokepoints, Rivers, Harbors

### 1.2 Faction System
- [ ] 6-10 starting factions (kingdoms, tribes, cults)
- [ ] Faction traits: Aggressive, Diplomatic, Mercantile, Isolationist
- [ ] Capital cities + territories
- [ ] Faction colors/banners (maps to team colors in battles)

### 1.3 Population
- [ ] 10,000+ agents with names, roles, traits
- [ ] Aging system (birth, maturity, death)
- [ ] Family trees / dynasties
- [ ] Role distribution per faction (warriors, mages, clerics, etc.)

---

## Phase 2: Simulation Engine

### 2.1 Time System
- [ ] Turn-based years (1 turn = 1 year)
- [ ] Seasonal events (harvests, winters, festivals)
- [ ] Historical timeline with logged events

### 2.2 Politics & Diplomacy
- [ ] Alliances, treaties, betrayals
- [ ] Marriage pacts between dynasties
- [ ] Trade agreements
- [ ] Vassalage / tribute systems
- [ ] Assassination plots

### 2.3 War System
- [ ] Declaration of war (casus belli)
- [ ] Army composition from population
- [ ] March to battle (movement on map)
- [ ] **BATTLES → Use Savage Arena skirmish engine!**
- [ ] Siege mechanics for cities
- [ ] Surrender / annexation

### 2.4 Economy
- [ ] Resource production
- [ ] Trade routes
- [ ] Taxation / treasury
- [ ] Army upkeep costs

---

## Phase 3: Legends & Events

### 3.1 Hero System
- [ ] Exceptional individuals emerge (high stats/kills)
- [ ] Titles earned: "The Unbreakable", "Kingslayer", "Bonelord"
- [ ] Personal quests / rivalries
- [ ] Retirement / legendary status

### 3.2 Event Generation
- [ ] Natural disasters (plagues, famines, earthquakes)
- [ ] Religious events (prophets, crusades)
- [ ] Discoveries (artifacts, magic, technology)
- [ ] Rebellions / civil wars

### 3.3 Chronicle System
- [ ] Auto-generated prose for events
- [ ] "In the year 342, King Ironjaw the Unbreakable led 500 warriors against the Necromancer Bonelord's undead horde at the Battle of Ashfield..."
- [ ] Searchable history by era, faction, person
- [ ] Legends mode browser

---

## Phase 4: Integration with Savage Arena

### 4.1 Battle Hook
```javascript
// When war occurs, generate armies from simulation
const battle = generateBattle(attackingFaction, defendingFaction);
// battle.team0 = attacker's 15 best fighters
// battle.team1 = defender's 15 best fighters
// Run through existing Savage Arena engine
const result = runSkirmish(battle);
// Apply casualties back to simulation
applyBattleResults(result);
```

### 4.2 NFT Integration
- [ ] Each of the 5555 Chimeras is an agent in the world
- [ ] NFT owners can influence their Chimera's faction
- [ ] Battle history stored on-chain or IPFS
- [ ] Legendary status = metadata upgrade

### 4.3 Spectator Mode
- [ ] Watch historical battles replay
- [ ] "Relive the Battle of Ashfield" with full Savage Arena visuals
- [ ] Betting on historical battle recreations

---

## Tech Stack (Proposed)

| Component | Technology |
|-----------|------------|
| World Sim | JavaScript/TypeScript (runs client or server) |
| Storage | IndexedDB (client) or PostgreSQL (server) |
| Map Render | Canvas or Pixi.js |
| Battle Engine | Savage Arena (existing) |
| History Browser | React/Vue SPA |
| NFT Metadata | IPFS + Base chain |

---

## MVP Scope (v0.1)

For first playable version:
1. 3 factions, 1000 agents
2. 50-year simulation
3. Basic war/peace cycle
4. Battles use Savage Arena
5. Text-based chronicle output
6. Simple map visualization

---

## Current Assets Ready

From Savage Arena v27:
- ✅ 8 combat roles (Tank, Berserker, Mage, Cleric, Rogue, Bard, Necromancer, Minion)
- ✅ Trait system
- ✅ Morale / rout / surrender mechanics
- ✅ Rally cries and leadership
- ✅ Raise dead / summon minions
- ✅ DF-style combat log generator
- ✅ King assassination win condition
- ✅ JSON/CSV fighter data format

---

## Timeline Estimate

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1 | 2-3 weeks | World generation, factions, population |
| Phase 2 | 3-4 weeks | Simulation loop, wars, battles |
| Phase 3 | 2-3 weeks | Legends, chronicles, heroes |
| Phase 4 | 2 weeks | NFT integration, spectator mode |
| **Total** | **~10 weeks** | Full Legends Mode |

---

## Notes

- Keep simulation deterministic (seeded RNG) for replay
- Every battle should be replayable from saved state
- Consider server-side simulation for shared world state
- Mobile-friendly chronicle browser

---

*"History is written by the survivors. In the Savage Lands, survival is never guaranteed."*
