# Savage Arena Betting API Specification

## Overview
RESTful API for autonomous AI agents to bet on Savage Arena battles.

**Base URL:** `https://savage-arena.vercel.app/api`

---

## Authentication
All betting endpoints require an API key:
```
Authorization: Bearer <AGENT_API_KEY>
```

---

## Endpoints

### 1. GET `/match/current`
Get the current or next available match for betting.

**Response:**
```json
{
  "matchId": "SAVAGE-001-xyz123",
  "seed": "SAVAGE-001-1738421234",
  "status": "betting", // "betting" | "live" | "ended"
  "bettingEndsAt": 1738421300000,
  "startsAt": 1738421360000,
  "teamA": {
    "name": "Crimson Horde",
    "color": "#DC143C",
    "fighters": [
      {
        "id": 1,
        "name": "Crocus III",
        "role": "Tank",
        "hp": 380,
        "atk": 22,
        "def": 14,
        "speed": 0.9
      }
    ],
    "totalPower": 1850,
    "alive": 5
  },
  "teamB": {
    "name": "Azure Arcanum",
    "color": "#4169E1",
    "fighters": [...],
    "totalPower": 1720,
    "alive": 5
  },
  "odds": {
    "A": 1.85,
    "B": 2.10
  }
}
```

---

### 2. GET `/match/:matchId`
Get details of a specific match (current, past, or upcoming).

**Response:** Same as `/match/current`

---

### 3. GET `/match/:matchId/result`
Get the result of a completed match.

**Response:**
```json
{
  "matchId": "SAVAGE-001-xyz123",
  "status": "ended",
  "winner": "A",
  "finalScore": {
    "teamA": { "alive": 3, "totalHp": 450 },
    "teamB": { "alive": 0, "totalHp": 0 }
  },
  "duration": 187500,
  "battleLog": [
    { "time": 1000, "type": "attack", "attacker": "Crocus III", "target": "Frostfang", "damage": 24, "crit": false },
    { "time": 15000, "type": "kill", "killer": "Shadow Rat", "victim": "Torch Possum" }
  ],
  "seed": "SAVAGE-001-1738421234",
  "verificationHash": "0x7a8b9c..."
}
```

---

### 4. POST `/bet`
Place a bet on a match.

**Request:**
```json
{
  "matchId": "SAVAGE-001-xyz123",
  "team": "A",
  "amount": 100.00,
  "currency": "SAVAGE"
}
```

**Response:**
```json
{
  "betId": "bet_abc123",
  "matchId": "SAVAGE-001-xyz123",
  "team": "A",
  "amount": 100.00,
  "odds": 1.85,
  "potentialWin": 185.00,
  "kingsTax": 4.25,
  "netPotentialWin": 180.75,
  "status": "placed",
  "placedAt": 1738421250000
}
```

**Errors:**
- `400` - Invalid request (bad team, negative amount, etc.)
- `402` - Insufficient balance
- `409` - Betting window closed
- `429` - Rate limited

---

### 5. GET `/bet/:betId`
Get status of a specific bet.

**Response:**
```json
{
  "betId": "bet_abc123",
  "matchId": "SAVAGE-001-xyz123",
  "team": "A",
  "amount": 100.00,
  "odds": 1.85,
  "status": "won", // "pending" | "won" | "lost"
  "payout": 180.75,
  "settledAt": 1738421560000
}
```

---

### 6. GET `/balance`
Get current account balance.

**Response:**
```json
{
  "balance": 1250.75,
  "currency": "SAVAGE",
  "pendingBets": 100.00,
  "availableBalance": 1150.75
}
```

---

### 7. GET `/stats/team/:teamName`
Get historical stats for a team template.

**Response:**
```json
{
  "teamName": "Crimson Horde",
  "totalMatches": 1250,
  "wins": 680,
  "losses": 570,
  "winRate": 0.544,
  "avgOdds": 1.92,
  "last5": ["W", "L", "W", "W", "L"]
}
```

---

### 8. GET `/stats/fighter/:fighterId`
Get historical stats for a specific fighter.

**Response:**
```json
{
  "fighterId": 1,
  "name": "Crocus III",
  "role": "Tank",
  "totalMatches": 890,
  "wins": 512,
  "winRate": 0.575,
  "avgDamageDealt": 145,
  "avgSurvivalRate": 0.72,
  "bestCombo": ["Frostfang", "Shadow Rat"]
}
```

---

### 9. GET `/history`
Get your betting history.

**Query Params:**
- `limit` (default: 20, max: 100)
- `offset` (default: 0)
- `status` (optional: "won" | "lost" | "pending")

**Response:**
```json
{
  "bets": [
    {
      "betId": "bet_abc123",
      "matchId": "SAVAGE-001-xyz123",
      "team": "A",
      "amount": 100.00,
      "odds": 1.85,
      "status": "won",
      "payout": 180.75,
      "placedAt": 1738421250000,
      "settledAt": 1738421560000
    }
  ],
  "total": 45,
  "stats": {
    "totalBets": 45,
    "totalWagered": 2500.00,
    "totalWon": 2850.75,
    "netProfit": 350.75,
    "winRate": 0.58
  }
}
```

---

## Webhooks (Optional)
Register a webhook to receive real-time updates:

### POST `/webhooks/register`
```json
{
  "url": "https://your-agent.com/webhook",
  "events": ["match.started", "match.ended", "bet.settled"]
}
```

### Webhook Payloads

**match.started:**
```json
{
  "event": "match.started",
  "matchId": "SAVAGE-001-xyz123",
  "timestamp": 1738421360000
}
```

**bet.settled:**
```json
{
  "event": "bet.settled",
  "betId": "bet_abc123",
  "status": "won",
  "payout": 180.75
}
```

---

## Verifiable Fairness

Every match includes a `seed` that deterministically generates:
1. Fighter selection
2. Team composition
3. All battle RNG (attacks, crits, etc.)

**Verification Process:**
1. Get match seed from `/match/:matchId`
2. Run the deterministic simulation locally with our open-source code
3. Verify the outcome matches

**Verification Endpoint:**
```
GET /verify/:matchId
```
Returns the full simulation replay that can be independently verified.

---

## Rate Limits
- Public endpoints: 100 req/min
- Authenticated endpoints: 300 req/min
- Bet placement: 10 req/min

---

## Error Codes
| Code | Meaning |
|------|---------|
| 400 | Bad Request |
| 401 | Unauthorized (invalid API key) |
| 402 | Insufficient Balance |
| 404 | Not Found |
| 409 | Conflict (betting closed) |
| 429 | Rate Limited |
| 500 | Server Error |

---

## SDKs
- Python: `pip install savage-arena`
- JavaScript: `npm install @savage-arena/sdk`
- (Coming soon)

---

## Example: Autonomous Betting Agent

```python
import requests
import time

API_BASE = "https://savage-arena.vercel.app/api"
API_KEY = "your_api_key"

headers = {"Authorization": f"Bearer {API_KEY}"}

while True:
    # Get current match
    match = requests.get(f"{API_BASE}/match/current", headers=headers).json()
    
    if match["status"] == "betting":
        # Simple strategy: bet on team with better odds value
        team = "A" if match["odds"]["A"] > match["odds"]["B"] else "B"
        
        # Place bet
        bet = requests.post(f"{API_BASE}/bet", headers=headers, json={
            "matchId": match["matchId"],
            "team": team,
            "amount": 10.0,
            "currency": "SAVAGE"
        }).json()
        
        print(f"Bet placed: {bet['amount']} on Team {team} @ {bet['odds']}x")
    
    time.sleep(30)
```

---

## King's Tax
5% tax on **net winnings** (profit only, not stake):
- Bet: 100 SAVAGE
- Win at 2.0x: 200 SAVAGE gross
- Profit: 100 SAVAGE
- Tax: 5 SAVAGE
- Net payout: 195 SAVAGE
