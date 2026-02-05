#!/usr/bin/env python3
"""
Savage Arena Autonomous Betting Agent

Runs 24/7, analyzes matches, places bets, compounds winnings.
Uses Bankr Bot for SAVAGE token transactions.

Usage:
    python savage_trader.py --api-key YOUR_KEY

Environment:
    BANKR_API_KEY - Bankr Bot API key
    SAVAGE_ARENA_URL - Arena API base URL (default: https://savage-arena.vercel.app)
"""

import os
import sys
import json
import time
import random
import hashlib
import argparse
import logging
from datetime import datetime
from typing import Dict, Optional, List
from dataclasses import dataclass

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('savage_trader.log')
    ]
)
logger = logging.getLogger(__name__)

try:
    import httpx
except ImportError:
    logger.error("httpx not installed. Run: pip install httpx")
    sys.exit(1)

# ============ CONFIGURATION ============
@dataclass
class Config:
    arena_url: str = "https://savage-arena.vercel.app"
    bankr_url: str = "https://api.bankr.bot"
    bankr_api_key: str = ""
    
    # Risk parameters
    min_confidence: float = 0.55  # Don't bet below 55% confidence
    max_wager_pct: float = 0.20   # Max 20% of bankroll per bet
    min_wager: float = 1.0        # Minimum bet
    kelly_fraction: float = 0.25  # Kelly criterion fraction (conservative)
    
    # Timing
    poll_interval: int = 5        # Seconds between API polls
    bet_buffer_seconds: int = 10  # Place bet this many seconds before window closes
    
    # Session limits
    max_consecutive_losses: int = 5
    stop_loss_pct: float = 0.50   # Stop if balance drops 50%
    
    # Currency
    currency: str = "SAVAGE"


# ============ FIGHTER ANALYSIS ============
ROLE_WEIGHTS = {
    "Tank": {"hp": 1.2, "def": 1.3, "atk": 0.8, "spd": 0.7},
    "Berserker": {"hp": 0.9, "def": 0.7, "atk": 1.4, "spd": 1.1},
    "Mage": {"hp": 0.7, "def": 0.6, "atk": 1.3, "spd": 0.9},
    "Rogue": {"hp": 0.8, "def": 0.5, "atk": 1.3, "spd": 1.4},
    "Paladin": {"hp": 1.1, "def": 1.2, "atk": 1.0, "spd": 0.9},
    "Necromancer": {"hp": 0.7, "def": 0.6, "atk": 1.1, "spd": 0.9},
    "Controller": {"hp": 0.8, "def": 0.7, "atk": 1.0, "spd": 1.0},
    "Cleric": {"hp": 0.9, "def": 0.9, "atk": 0.7, "spd": 1.0},
}

TEAM_SYNERGY = {
    # Good combos
    ("Tank", "Mage"): 1.1,
    ("Tank", "Rogue"): 1.05,
    ("Paladin", "Berserker"): 1.1,
    ("Cleric", "Tank"): 1.15,
    ("Necromancer", "Tank"): 1.08,
    
    # Bad combos
    ("Rogue", "Rogue"): 0.9,  # Too squishy
    ("Mage", "Mage"): 0.92,
}


def calculate_fighter_power(fighter: Dict) -> float:
    """Calculate adjusted power rating for a fighter."""
    role = fighter.get("role", "Berserker")
    weights = ROLE_WEIGHTS.get(role, {"hp": 1, "def": 1, "atk": 1, "spd": 1})
    
    hp = fighter.get("hp", 100)
    atk = fighter.get("atk", 10)
    defense = fighter.get("def", 5)
    spd = fighter.get("spd", 1.0)
    
    power = (
        hp * 0.4 * weights["hp"] +
        atk * 2.5 * weights["atk"] +
        defense * 1.5 * weights["def"] +
        spd * 15 * weights["spd"]
    )
    
    return power


def calculate_team_synergy(fighters: List[Dict]) -> float:
    """Calculate team synergy multiplier based on role combinations."""
    roles = [f.get("role", "Berserker") for f in fighters]
    synergy = 1.0
    
    # Check all pairs
    for i, r1 in enumerate(roles):
        for r2 in roles[i+1:]:
            pair = tuple(sorted([r1, r2]))
            if pair in TEAM_SYNERGY:
                synergy *= TEAM_SYNERGY[pair]
    
    # Bonus for role diversity
    unique_roles = len(set(roles))
    if unique_roles >= 3:
        synergy *= 1.05
    
    return synergy


def analyze_team(team: Dict) -> Dict:
    """Deep analysis of a team."""
    fighters = team.get("fighters", [])
    
    # Individual power
    powers = [calculate_fighter_power(f) for f in fighters]
    total_power = sum(powers)
    avg_power = total_power / len(fighters) if fighters else 0
    
    # Synergy
    synergy = calculate_team_synergy(fighters)
    
    # Role composition
    roles = [f.get("role", "Unknown") for f in fighters]
    has_tank = any(r in ["Tank", "Paladin"] for r in roles)
    has_healer = any(r in ["Cleric", "Paladin"] for r in roles)
    has_dps = any(r in ["Berserker", "Rogue", "Mage"] for r in roles)
    
    # Survivability (avg HP + def)
    avg_hp = sum(f.get("hp", 100) for f in fighters) / len(fighters) if fighters else 100
    avg_def = sum(f.get("def", 5) for f in fighters) / len(fighters) if fighters else 5
    survivability = (avg_hp / 400) * 0.6 + (avg_def / 15) * 0.4
    
    # Damage output
    avg_atk = sum(f.get("atk", 10) for f in fighters) / len(fighters) if fighters else 10
    avg_spd = sum(f.get("spd", 1.0) for f in fighters) / len(fighters) if fighters else 1.0
    damage_output = (avg_atk / 30) * 0.7 + (avg_spd / 1.5) * 0.3
    
    return {
        "total_power": total_power,
        "adjusted_power": total_power * synergy,
        "synergy": synergy,
        "has_tank": has_tank,
        "has_healer": has_healer,
        "has_dps": has_dps,
        "survivability": survivability,
        "damage_output": damage_output,
        "composition_score": (
            (0.3 if has_tank else 0) +
            (0.2 if has_healer else 0) +
            (0.3 if has_dps else 0) +
            (0.2 * synergy)
        )
    }


def pick_best_team(match: Dict, config: Config) -> Optional[Dict]:
    """
    Analyze match and pick the best team to bet on.
    Returns: {"team_idx": int, "confidence": float, "reasoning": str}
    """
    teams = match.get("teams", [])
    if not teams:
        return None
    
    analyses = []
    for i, team in enumerate(teams):
        analysis = analyze_team(team)
        analysis["idx"] = i
        analysis["name"] = team.get("name", f"Team {i}")
        analysis["odds"] = team.get("odds", 1.0)
        analyses.append(analysis)
    
    # Rank by adjusted power
    analyses.sort(key=lambda x: x["adjusted_power"], reverse=True)
    
    # Calculate win probabilities
    total_power = sum(a["adjusted_power"] for a in analyses)
    for a in analyses:
        a["win_prob"] = a["adjusted_power"] / total_power if total_power > 0 else 0
    
    # Find best value bet (highest edge = prob * odds - 1)
    best = None
    best_edge = 0
    
    for a in analyses:
        expected_value = a["win_prob"] * a["odds"]
        edge = expected_value - 1
        
        # Only bet if we have positive expected value
        if edge > best_edge and a["win_prob"] >= config.min_confidence:
            best = a
            best_edge = edge
    
    if best is None:
        return None
    
    # Calculate confidence (0-1)
    # Higher confidence = higher win probability + higher edge
    confidence = min(1.0, best["win_prob"] + best_edge * 0.3)
    
    reasoning = (
        f"Team '{best['name']}' selected. "
        f"Win prob: {best['win_prob']:.1%}, Odds: {best['odds']:.2f}x, "
        f"Edge: {best_edge:.1%}. "
        f"Composition: {'Tank✓' if best['has_tank'] else 'No tank'}, "
        f"{'Healer✓' if best['has_healer'] else 'No healer'}. "
        f"Synergy: {best['synergy']:.2f}x"
    )
    
    return {
        "team_idx": best["idx"],
        "team_name": best["name"],
        "confidence": confidence,
        "win_prob": best["win_prob"],
        "odds": best["odds"],
        "edge": best_edge,
        "reasoning": reasoning
    }


def calculate_wager(
    bankroll: float,
    confidence: float,
    odds: float,
    config: Config
) -> float:
    """
    Calculate optimal wager using Kelly Criterion (fractional).
    """
    # Kelly formula: f* = (bp - q) / b
    # where b = odds - 1, p = win probability, q = 1 - p
    b = odds - 1
    p = confidence
    q = 1 - p
    
    kelly_full = (b * p - q) / b if b > 0 else 0
    kelly_fraction = kelly_full * config.kelly_fraction
    
    # Constrain by max wager percentage
    wager_pct = min(kelly_fraction, config.max_wager_pct)
    wager_pct = max(0, wager_pct)
    
    wager = bankroll * wager_pct
    wager = max(config.min_wager, wager)
    wager = min(bankroll * 0.95, wager)  # Never bet more than 95%
    
    return round(wager, 2)


# ============ API CLIENT ============
class SavageArenaClient:
    def __init__(self, config: Config):
        self.config = config
        self.client = httpx.Client(timeout=30.0)
        self.session_id = hashlib.md5(str(time.time()).encode()).hexdigest()[:8]
    
    def get_current_match(self) -> Optional[Dict]:
        """Fetch current match from arena API."""
        try:
            resp = self.client.get(f"{self.config.arena_url}/api/match/current")
            if resp.status_code == 200:
                return resp.json()
            logger.warning(f"Failed to get match: {resp.status_code}")
            return None
        except Exception as e:
            logger.error(f"Error fetching match: {e}")
            return None
    
    def get_match_result(self, match_id: str) -> Optional[Dict]:
        """Fetch match result."""
        try:
            resp = self.client.get(f"{self.config.arena_url}/api/match/{match_id}/result")
            if resp.status_code == 200:
                return resp.json()
            return None
        except Exception as e:
            logger.error(f"Error fetching result: {e}")
            return None
    
    def place_bet(self, match_id: str, team_idx: int, amount: float) -> Optional[Dict]:
        """Place a bet via API."""
        try:
            resp = self.client.post(
                f"{self.config.arena_url}/api/bet",
                json={
                    "matchId": match_id,
                    "team": team_idx,
                    "amount": amount,
                    "currency": self.config.currency
                },
                headers={"Authorization": f"Bearer {self.session_id}"}
            )
            if resp.status_code == 200:
                return resp.json()
            logger.warning(f"Bet failed: {resp.status_code} - {resp.text}")
            return None
        except Exception as e:
            logger.error(f"Error placing bet: {e}")
            return None
    
    def get_balance(self) -> float:
        """Get current balance from API."""
        try:
            resp = self.client.get(
                f"{self.config.arena_url}/api/balance",
                headers={"Authorization": f"Bearer {self.session_id}"}
            )
            if resp.status_code == 200:
                return resp.json().get("balance", 0)
            return 0
        except Exception as e:
            logger.error(f"Error fetching balance: {e}")
            return 0


# ============ BANKR INTEGRATION ============
class BankrClient:
    """Client for Bankr Bot API for real token transactions."""
    
    def __init__(self, api_key: str, api_url: str = "https://api.bankr.bot"):
        self.api_key = api_key
        self.api_url = api_url
        self.client = httpx.Client(timeout=60.0)
    
    def submit_job(self, prompt: str) -> Optional[str]:
        """Submit a job to Bankr and return job ID."""
        try:
            resp = self.client.post(
                f"{self.api_url}/agent/submit",
                json={"prompt": prompt},
                headers={"Authorization": f"Bearer {self.api_key}"}
            )
            if resp.status_code == 200:
                return resp.json().get("jobId")
            logger.error(f"Bankr submit failed: {resp.status_code}")
            return None
        except Exception as e:
            logger.error(f"Bankr error: {e}")
            return None
    
    def poll_job(self, job_id: str, max_wait: int = 120) -> Optional[Dict]:
        """Poll job until complete."""
        start = time.time()
        while time.time() - start < max_wait:
            try:
                resp = self.client.get(
                    f"{self.api_url}/agent/job/{job_id}",
                    headers={"Authorization": f"Bearer {self.api_key}"}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    status = data.get("status")
                    if status == "completed":
                        return data
                    elif status in ["failed", "cancelled"]:
                        logger.error(f"Job {status}: {data.get('error')}")
                        return None
                time.sleep(2)
            except Exception as e:
                logger.error(f"Poll error: {e}")
                time.sleep(2)
        logger.error("Job timed out")
        return None
    
    def execute(self, prompt: str) -> Optional[Dict]:
        """Submit and wait for completion."""
        job_id = self.submit_job(prompt)
        if not job_id:
            return None
        return self.poll_job(job_id)
    
    def get_balance(self, token: str = "SAVAGE", chain: str = "Base") -> float:
        """Get token balance via Bankr."""
        result = self.execute(f"What is my {token} balance on {chain}?")
        if result and result.get("result"):
            # Parse balance from response
            text = str(result.get("result", ""))
            # Try to extract number
            import re
            numbers = re.findall(r'[\d,]+\.?\d*', text)
            if numbers:
                return float(numbers[0].replace(',', ''))
        return 0
    
    def transfer(self, to_address: str, amount: float, token: str = "SAVAGE") -> bool:
        """Transfer tokens via Bankr."""
        result = self.execute(f"Send {amount} {token} to {to_address} on Base")
        return result is not None and result.get("status") == "completed"


# ============ MAIN TRADING LOOP ============
class SavageTrader:
    def __init__(self, config: Config):
        self.config = config
        self.arena = SavageArenaClient(config)
        self.bankr = BankrClient(config.bankr_api_key, config.bankr_url) if config.bankr_api_key else None
        
        self.session_stats = {
            "start_time": datetime.now(),
            "start_balance": 0,
            "bets_placed": 0,
            "bets_won": 0,
            "bets_lost": 0,
            "total_wagered": 0,
            "total_won": 0,
            "consecutive_losses": 0,
            "best_win": 0,
            "worst_loss": 0,
        }
        self.current_bet = None
        self.last_match_id = None
    
    def get_balance(self) -> float:
        """Get current balance from appropriate source."""
        if self.bankr:
            return self.bankr.get_balance(self.config.currency)
        return self.arena.get_balance()
    
    def log_stats(self):
        """Log current session statistics."""
        s = self.session_stats
        runtime = (datetime.now() - s["start_time"]).total_seconds() / 3600
        win_rate = s["bets_won"] / s["bets_placed"] if s["bets_placed"] > 0 else 0
        profit = s["total_won"] - s["total_wagered"]
        roi = profit / s["total_wagered"] if s["total_wagered"] > 0 else 0
        
        logger.info(f"""
========== SESSION STATS ==========
Runtime: {runtime:.1f} hours
Bets: {s['bets_placed']} ({s['bets_won']}W / {s['bets_lost']}L)
Win Rate: {win_rate:.1%}
Total Wagered: {s['total_wagered']:.2f} {self.config.currency}
Total Won: {s['total_won']:.2f} {self.config.currency}
Profit: {profit:+.2f} {self.config.currency} ({roi:+.1%} ROI)
Best Win: {s['best_win']:.2f}
Worst Loss: {s['worst_loss']:.2f}
===================================
""")
    
    def should_stop(self, current_balance: float) -> bool:
        """Check if we should stop trading."""
        # Stop loss
        if self.session_stats["start_balance"] > 0:
            loss_pct = 1 - (current_balance / self.session_stats["start_balance"])
            if loss_pct >= self.config.stop_loss_pct:
                logger.warning(f"Stop loss triggered: {loss_pct:.1%} loss")
                return True
        
        # Consecutive losses
        if self.session_stats["consecutive_losses"] >= self.config.max_consecutive_losses:
            logger.warning(f"Max consecutive losses reached: {self.session_stats['consecutive_losses']}")
            return True
        
        # Zero balance
        if current_balance < self.config.min_wager:
            logger.warning("Insufficient balance to continue")
            return True
        
        return False
    
    def run_once(self) -> bool:
        """
        Run one iteration of the trading loop.
        Returns True if should continue, False if should stop.
        """
        # Get current match
        match = self.arena.get_current_match()
        if not match:
            logger.debug("No match available, waiting...")
            time.sleep(self.config.poll_interval)
            return True
        
        match_id = match.get("matchId") or match.get("id")
        status = match.get("status", "unknown")
        
        # Skip if same match we already bet on
        if match_id == self.last_match_id and self.current_bet:
            # Wait for result
            if status == "ended":
                # Check result
                result = self.arena.get_match_result(match_id)
                if result:
                    winner = result.get("winner")
                    bet_team = self.current_bet["team_idx"]
                    won = (winner == bet_team)
                    
                    if won:
                        payout = self.current_bet["wager"] * self.current_bet["odds"]
                        profit = payout - self.current_bet["wager"]
                        self.session_stats["bets_won"] += 1
                        self.session_stats["total_won"] += payout
                        self.session_stats["consecutive_losses"] = 0
                        self.session_stats["best_win"] = max(self.session_stats["best_win"], profit)
                        logger.info(f"🎉 WON! +{profit:.2f} {self.config.currency}")
                    else:
                        loss = self.current_bet["wager"]
                        self.session_stats["bets_lost"] += 1
                        self.session_stats["consecutive_losses"] += 1
                        self.session_stats["worst_loss"] = max(self.session_stats["worst_loss"], loss)
                        logger.info(f"💸 LOST! -{loss:.2f} {self.config.currency}")
                    
                    self.current_bet = None
                    self.last_match_id = None
                    self.log_stats()
            
            time.sleep(self.config.poll_interval)
            return True
        
        # New match - analyze and potentially bet
        if status == "betting" and match_id != self.last_match_id:
            balance = self.get_balance()
            
            if self.session_stats["start_balance"] == 0:
                self.session_stats["start_balance"] = balance
            
            if self.should_stop(balance):
                return False
            
            logger.info(f"📊 Analyzing match {match_id}...")
            
            # Analyze and pick team
            pick = pick_best_team(match, self.config)
            
            if pick and pick["confidence"] >= self.config.min_confidence:
                wager = calculate_wager(
                    balance,
                    pick["confidence"],
                    pick["odds"],
                    self.config
                )
                
                logger.info(f"🎯 {pick['reasoning']}")
                logger.info(f"💰 Wagering {wager:.2f} {self.config.currency} (Balance: {balance:.2f})")
                
                # Place bet
                bet_result = self.arena.place_bet(match_id, pick["team_idx"], wager)
                
                if bet_result:
                    self.current_bet = {
                        "match_id": match_id,
                        "team_idx": pick["team_idx"],
                        "team_name": pick["team_name"],
                        "wager": wager,
                        "odds": pick["odds"],
                        "confidence": pick["confidence"],
                    }
                    self.last_match_id = match_id
                    self.session_stats["bets_placed"] += 1
                    self.session_stats["total_wagered"] += wager
                    logger.info(f"✅ Bet placed on {pick['team_name']} @ {pick['odds']:.2f}x")
                else:
                    logger.warning("Failed to place bet")
            else:
                reason = "No positive edge found" if not pick else f"Confidence too low ({pick['confidence']:.1%})"
                logger.info(f"⏭️ Skipping match: {reason}")
                self.last_match_id = match_id  # Don't re-analyze
        
        time.sleep(self.config.poll_interval)
        return True
    
    def run(self):
        """Main trading loop - runs until stopped."""
        logger.info("""
╔═══════════════════════════════════════╗
║  🎰 SAVAGE ARENA TRADING BOT 🎰       ║
║  24/7 Autonomous Betting Agent        ║
╚═══════════════════════════════════════╝
""")
        logger.info(f"Arena URL: {self.config.arena_url}")
        logger.info(f"Min confidence: {self.config.min_confidence:.0%}")
        logger.info(f"Max wager: {self.config.max_wager_pct:.0%} of bankroll")
        logger.info(f"Kelly fraction: {self.config.kelly_fraction:.0%}")
        logger.info("Starting trading loop...\n")
        
        try:
            while True:
                if not self.run_once():
                    logger.info("Trading stopped.")
                    break
        except KeyboardInterrupt:
            logger.info("\nShutdown requested...")
        finally:
            self.log_stats()
            logger.info("Goodbye! 🤙")


# ============ CLI ============
def main():
    parser = argparse.ArgumentParser(description="Savage Arena Autonomous Betting Agent")
    parser.add_argument("--arena-url", default=os.getenv("SAVAGE_ARENA_URL", "https://savage-arena.vercel.app"))
    parser.add_argument("--bankr-key", default=os.getenv("BANKR_API_KEY", ""))
    parser.add_argument("--min-confidence", type=float, default=0.55)
    parser.add_argument("--max-wager", type=float, default=0.20)
    parser.add_argument("--kelly", type=float, default=0.25)
    parser.add_argument("--min-bet", type=float, default=1.0)
    parser.add_argument("--stop-loss", type=float, default=0.50)
    parser.add_argument("--dry-run", action="store_true", help="Simulate without placing real bets")
    
    args = parser.parse_args()
    
    config = Config(
        arena_url=args.arena_url,
        bankr_api_key=args.bankr_key,
        min_confidence=args.min_confidence,
        max_wager_pct=args.max_wager,
        kelly_fraction=args.kelly,
        min_wager=args.min_bet,
        stop_loss_pct=args.stop_loss,
    )
    
    trader = SavageTrader(config)
    trader.run()


if __name__ == "__main__":
    main()
