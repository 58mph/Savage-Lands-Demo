# ⚔️ Savage Arena - AI Betting Pit

24/7 AI agent battles with betting. Verifiably fair. 5% King's Tax funds the arena.

## What Is This?

An autonomous arena where AI fighters battle 5v5. Agents (or humans) bet on outcomes. Matches run every 5 minutes, 24/7.

## Features

- **🤖 30 Unique Fighters** - Tanks, Berserkers, Mages, Rogues, Necromancers, and more
- **💰 Betting System** - Place wagers, win at odds
- **🔒 Verifiably Fair** - Deterministic seeded RNG, verify any match yourself
- **👑 5% King's Tax** - House takes 5% of profits (not stake)
- **📡 REST API** - Build autonomous betting agents

## Quick Start

### Watch Battles
Just visit the site and click "Enter Arena"

### Place Bets
1. Select a team (A or B)
2. Set your wager amount
3. Click "Place Bet" before betting window closes
4. Watch the battle
5. Collect winnings (or cry)

### Build a Betting Bot
```bash
# Get current match
curl https://savage-arena.vercel.app/api/match/current

# Place a bet
curl -X POST https://savage-arena.vercel.app/api/bet \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"matchId":"SAVAGE-123","team":"A","amount":10}'

# Get result
curl https://savage-arena.vercel.app/api/match/SAVAGE-123/result
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/match/current` | GET | Get current/next match |
| `/api/match/:id/result` | GET | Get match result + battle log |
| `/api/bet` | POST | Place a bet |
| `/api/balance` | GET | Check your balance |
| `/api/verify/:id` | GET | Verify match fairness |

See [API-SPEC.md](./API-SPEC.md) for full documentation.

## Verifiable Fairness

Every match uses a deterministic seed: `SAVAGE-{matchId}`

The battle outcome is 100% determined by:
1. The seed (public before betting)
2. The RNG algorithm (open source)
3. Fighter stats (fixed)

You can verify any match by running the simulation locally with the same seed.

```javascript
// Verify endpoint shows you how
GET /api/verify/SAVAGE-123
```

## Economics

- **Starting Balance**: 1000 SAVAGE (demo credits)
- **Minimum Bet**: 0.1 SAVAGE
- **King's Tax**: 5% of profits
- **Match Frequency**: Every 5 minutes

### Example
- Bet: 100 SAVAGE on Team A @ 1.85x
- Win: 185 SAVAGE gross
- Profit: 85 SAVAGE
- Tax: 4.25 SAVAGE (5% of profit)
- Net: 180.75 SAVAGE

## Deploy Your Own

```bash
# Clone
git clone https://github.com/savage-arena/arena
cd arena

# Deploy to Vercel
npx vercel --prod
```

## Tech Stack

- **Frontend**: Vanilla JS, no frameworks
- **Backend**: Vercel Serverless Functions
- **Database**: None (demo uses in-memory, use KV/Postgres for production)
- **RNG**: Linear Congruential Generator (deterministic)

## License

MIT - Do whatever you want, just don't blame us when you lose your shirt.

---

Built for [HEAVY META: The Savage Lands](https://bueno.art/56cmuthp/heavymeta) 🦎⚔️
