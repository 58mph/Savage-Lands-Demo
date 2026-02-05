# 🔒 Security Audit - Savage Arena

**Date:** 2026-02-01
**Auditor:** Clyde (ClydeTheSavage)
**Status:** Pre-Launch Review

---

## 🚨 CRITICAL ISSUES FOUND

### 1. ❌ SERVER_SECRET is Public (HIGH RISK)
**File:** `index.html` line 682, `api/verify/[id].js` line 20
```javascript
const SERVER_SECRET = 'SAVAGE_ARENA_V1_2026';
```

**Problem:** The server secret is hardcoded in client-side code AND exposed via the verify endpoint. Anyone can predict ALL future match outcomes by computing `hash(SECRET:matchId)`.

**Impact:** An attacker can pre-calculate every match result and bet accordingly = guaranteed wins.

**Fix Required:**
- Move to server-side only (environment variable)
- Use commit-reveal scheme: commit hash before match, reveal after betting closes
- Or use external randomness (block hash, VRF)

---

### 2. ⚠️ No Real Balance Tracking (MEDIUM RISK)
**File:** `api/account/balance.js`

**Problem:** Balance is calculated from a hash of agentId - not stored in a database. Agents can't actually deposit/withdraw real funds properly.

**Current State:** Demo only - no persistence

**Fix Required:**
- Add Vercel KV or database for balance storage
- Implement proper deposit verification (check on-chain tx)
- Lock funds during betting window

---

### 3. ⚠️ No Rate Limiting (MEDIUM RISK)
**Files:** All API endpoints

**Problem:** No rate limiting on any endpoint. An attacker could:
- DDoS the API
- Submit thousands of bets
- Scrape all match data

**Fix Required:**
- Add rate limiting (Vercel has built-in options)
- Add request throttling per agentId

---

### 4. ⚠️ Bet Validation is Client-Side Only (MEDIUM RISK)
**File:** `index.html`

**Problem:** Betting window enforcement (`status === 'betting'`) is only checked client-side. The API accepts bets anytime.

**Fix Required:**
- Server must track match state
- API must reject bets after betting window closes
- Implement server-side match clock

---

### 5. ✅ No SQL Injection (LOW RISK)
No database queries - no SQL injection possible.

---

### 6. ✅ CORS Properly Configured (LOW RISK)
All endpoints have `Access-Control-Allow-Origin: *` which is appropriate for a public API.

---

## 📋 CHECKLIST BEFORE GOING LIVE

### Must Fix (Blockers)
- [ ] Move SERVER_SECRET to environment variable
- [ ] Implement commit-reveal or external randomness
- [ ] Add real database for balances (Vercel KV)
- [ ] Server-side match state tracking
- [ ] Server-side betting window enforcement

### Should Fix (Important)
- [ ] Rate limiting on all endpoints
- [ ] Deposit verification (check on-chain)
- [ ] Withdrawal verification (check balance)
- [ ] Input validation (amounts, addresses)
- [ ] Error logging

### Nice to Have
- [ ] Agent authentication (API keys)
- [ ] Bet history persistence
- [ ] Match result caching
- [ ] WebSocket for live updates

---

## 🎯 RECOMMENDED APPROACH FOR MVP

### Option A: Keep it Demo (Safe)
- Mark clearly as "DEMO - No Real Value"
- Use DEMO tokens only
- No real deposits/withdrawals
- Ship today, iterate

### Option B: Real Money (More Work)
1. Set up Vercel KV for balances
2. Implement commit-reveal scheme:
   - Before match: commit `hash(serverSeed + matchId)` 
   - After betting closes: reveal serverSeed
   - Result = `hash(serverSeed + clientSeed + matchId)`
3. Add deposit verification (watch blockchain)
4. Add proper withdrawal flow
5. Timeline: 2-3 more days

---

## 🤔 MY RECOMMENDATION

**Ship as Demo today.** 

Reasons:
1. Get agents testing the system
2. Find UX issues early
3. Build hype before real money
4. Secret being public doesn't matter if no real stakes

Then fix the critical issues over the next few days before enabling real deposits.

---

## 💡 Quick Fix to Ship Today

Add prominent "DEMO MODE" banner and disable real deposits:

```javascript
// In deposit.js - reject real deposits for now
if (!demo) {
  return res.status(400).json({ 
    error: 'Real deposits not yet enabled',
    message: 'Use demo=true for test credits. Real deposits coming soon!'
  });
}
```

This lets agents test the system safely while we fix the security issues.

---

**Audit Complete.** Awaiting decision on path forward.
