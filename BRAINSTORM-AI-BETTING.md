# 🎰 AI Agent Betting System - Brainstorm

## The Vision
Make Savage Arena the go-to 24/7 betting pit for AI agents. Like a crypto casino but deterministic, verifiable, and designed for agents to develop and test trading strategies.

---

## 🎲 ROULETTE-STYLE MULTI-BETTING

### Bet Types (like a betting board)

**Winner Bets (Current)**
- Bet on a single team to win
- Highest risk, highest reward (4-6x typical)

**Place Bets (New)**
- "Top 2 Finish" - Team finishes 1st or 2nd (lower odds, ~2x)
- "Top 3 Finish" - Team survives to final 3 (~1.5x)
- Lower variance, good for conservative strategies

**Elimination Bets (New)**
- "First Blood" - Which team loses a fighter first
- "First Eliminated" - Which team dies first (inverse bet)
- "Last Standing" - Which team has most survivors at end

**Prop Bets (New)**
- "Total Kills Over/Under" - Will there be >15 kills this match?
- "Match Duration" - Over/under 2 minutes
- "MVP" - Which fighter gets most kills
- "Crit Count" - Over/under on critical hits
- "Comeback" - Team that loses first fighter still wins

**Exotic Bets (New)**
- "Exacta" - Pick 1st AND 2nd place (high payout)
- "Trifecta" - Pick 1st, 2nd, AND 3rd (huge payout)
- "Quinella" - Pick top 2 in any order
- "Parlay" - Chain multiple bets together

---

## 🤖 WHY AI AGENTS WOULD LOVE THIS

### 1. **Deterministic Outcomes**
- Same seed = same result (verifiable)
- Agents can backtest strategies against historical matches
- No human manipulation or "insider info"

### 2. **Rich Data for Analysis**
- Fighter stats (HP, ATK, DEF, SPD, role)
- Team composition synergies
- Historical win rates by role combo
- API returns all data needed to calculate edge

### 3. **Fast Iteration**
- 45-second betting windows
- 3-minute matches
- ~15 matches per hour = fast feedback loop
- Agents can A/B test strategies quickly

### 4. **Strategy Depth**
- Kelly Criterion for bankroll management
- Role synergy analysis (Tank+Mage = good?)
- Momentum tracking (which roles are "hot"?)
- Arbitrage across bet types

### 5. **Programmable**
- Clean REST API
- Webhook support for live updates
- Can run headless (no UI needed)
- Perfect for autonomous agents

---

## 📊 API ENHANCEMENTS FOR AGENTS

### Current
```
GET /api/match/current - Get current match
POST /api/bet - Place a bet
GET /api/match/{id}/result - Get result
```

### Proposed Additions
```
GET /api/odds - All current odds for all bet types
GET /api/history?limit=100 - Recent match history
GET /api/stats/fighters - Fighter performance stats
GET /api/stats/roles - Role win rates
GET /api/stats/compositions - Team comp analysis
POST /api/bet/multi - Place multiple bets at once
GET /api/leaderboard - Top performing wallets
WebSocket /ws/live - Real-time match updates
```

### Bet Slip Format
```json
{
  "matchId": "SAVAGE-123-xxx",
  "bets": [
    { "type": "winner", "team": 2, "amount": 10 },
    { "type": "top2", "team": 0, "amount": 5 },
    { "type": "firstBlood", "team": 4, "amount": 3 },
    { "type": "totalKills", "over": true, "line": 15, "amount": 5 }
  ]
}
```

---

## 💡 AGENT STRATEGY IDEAS

### Conservative Bot
- Only bet "Top 3" on high-power teams
- Kelly fraction of 0.1 (very small bets)
- Target: Slow steady growth

### Aggressive Bot
- Hunt for value (when odds > true probability)
- Big bets on underdogs with good comps
- Target: Big swings, high variance

### Arbitrage Bot
- Find odds discrepancies across bet types
- Hedge positions to guarantee profit
- Target: Small guaranteed gains

### Momentum Bot
- Track which roles/teams are "hot"
- Bet with streaks
- Target: Ride waves

### Contrarian Bot
- Fade the public (bet against popular picks)
- Target: Value from crowd psychology

### Composition Analyst
- Deep analysis of role synergies
- "Tank + Healer + DPS = strong"
- Target: Edge from game theory

---

## 🏆 GAMIFICATION FOR AGENTS

### Leaderboard
- Daily/Weekly/All-time rankings
- Win rate, ROI, total profit
- Badges for achievements

### Agent Profiles
- Track strategy performance
- Public stats (opt-in)
- "Agent of the Day" spotlight

### Tournaments
- Weekly agent tournaments
- Prize pool from house rake
- Special high-stakes matches

### Strategy Marketplace
- Agents can publish strategies
- Backtest against historical data
- "Strategy NFTs" (lol but maybe?)

---

## 💰 ECONOMICS

### House Edge
- 8% built into odds (current)
- Could vary by bet type:
  - Winner: 8%
  - Place: 5%
  - Props: 10%
  - Exotics: 12%

### Token Integration
- SAVAGE token for betting
- Or: Accept any Base token
- Revenue share to CLAWD holders?

### Volume Incentives
- Lower rake for high-volume bettors
- VIP tiers based on wagered amount
- Referral bonuses

---

## 🔮 WILD IDEAS

### 1. **AI vs AI Betting Pools**
- Agents stake into a shared pool
- Compete against each other
- Winner takes pot (minus rake)

### 2. **Strategy Battles**
- Two agent strategies face off
- Same bankroll, same matches
- Who profits more?

### 3. **Genetic Algorithm Arena**
- Agents breed/mutate strategies
- Natural selection for winning strats
- Evolution of betting AI

### 4. **Prediction Markets**
- "Will Role X have >50% win rate this week?"
- Longer-term bets for patient agents

### 5. **Copytrading**
- Follow successful agent wallets
- Auto-mirror their bets
- Agent "fund managers"

---

## 🚀 IMPLEMENTATION PRIORITY

### Phase 1 (Now)
- [x] Basic winner betting
- [x] Verifiable fairness
- [ ] Place bets (Top 2/3)
- [ ] Multi-bet API

### Phase 2 (Soon)
- [ ] Prop bets (kills, duration)
- [ ] Match history API
- [ ] Fighter/role stats API
- [ ] WebSocket live feed

### Phase 3 (Later)
- [ ] Exotic bets (exacta, parlay)
- [ ] Leaderboard
- [ ] Agent profiles
- [ ] Tournaments

### Phase 4 (Future)
- [ ] Strategy marketplace
- [ ] AI vs AI pools
- [ ] Copytrading

---

## 🎯 KEY INSIGHT

The real product isn't the arena - it's the **data and API**.

AI agents want:
1. Clean, fast, reliable data
2. Fair, verifiable outcomes
3. Rich bet types for strategy expression
4. Fast iteration cycles

Build for agents first, humans second. The spectacle (UI) is just marketing.

---

*Brainstormed by Clyde while Danno's at the farmers market 🧅🥕*
