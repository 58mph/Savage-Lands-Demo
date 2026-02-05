// GET /api/match/current - Get current match for betting

const TEAM_SIZE = 5;
const BET_WINDOW = 60000;
const MATCH_INTERVAL = 300000; // 5 minutes

const FIGHTERS = [
    { id: 1, name: "Crocus III", hp: 380, atk: 22, def: 14, spd: 0.9, role: "Tank" },
    { id: 2, name: "Frostfang", hp: 290, atk: 28, def: 8, spd: 1.1, role: "Berserker" },
    { id: 3, name: "Flamekeeper", hp: 250, atk: 24, def: 10, spd: 0.85, role: "Mage" },
    { id: 4, name: "Destroyer", hp: 340, atk: 25, def: 12, spd: 1.0, role: "Berserker" },
    { id: 5, name: "Venomous", hp: 320, atk: 26, def: 11, spd: 1.25, role: "Rogue" },
    { id: 6, name: "Torch", hp: 260, atk: 30, def: 6, spd: 1.2, role: "Mage" },
    { id: 7, name: "Duelist", hp: 350, atk: 23, def: 13, spd: 0.9, role: "Tank" },
    { id: 8, name: "Grimclaw", hp: 420, atk: 24, def: 14, spd: 0.8, role: "Tank" },
    { id: 9, name: "Ashwalker", hp: 280, atk: 26, def: 9, spd: 1.2, role: "Berserker" },
    { id: 10, name: "Dreadfroth", hp: 240, atk: 32, def: 5, spd: 1.25, role: "Rogue" },
    { id: 11, name: "Shadowmere", hp: 260, atk: 28, def: 7, spd: 1.15, role: "Rogue" },
    { id: 12, name: "Ironscale", hp: 300, atk: 27, def: 10, spd: 1.1, role: "Berserker" },
    { id: 13, name: "Frostmage", hp: 280, atk: 22, def: 12, spd: 0.75, role: "Mage" },
    { id: 14, name: "Minotaur", hp: 480, atk: 28, def: 10, spd: 0.9, role: "Tank" },
    { id: 15, name: "Assassin", hp: 240, atk: 30, def: 6, spd: 1.3, role: "Rogue" },
    { id: 16, name: "Ursa", hp: 450, atk: 22, def: 16, spd: 0.75, role: "Tank" },
    { id: 17, name: "Flamebear", hp: 400, atk: 26, def: 12, spd: 0.8, role: "Berserker" },
    { id: 18, name: "Champion", hp: 360, atk: 24, def: 13, spd: 0.85, role: "Tank" },
    { id: 19, name: "Shadowrat", hp: 220, atk: 34, def: 4, spd: 1.3, role: "Rogue" },
    { id: 20, name: "Rotscale", hp: 300, atk: 27, def: 9, spd: 1.1, role: "Berserker" },
    { id: 21, name: "Voidcoon", hp: 280, atk: 24, def: 10, spd: 1.1, role: "Mage" },
    { id: 22, name: "Paladin", hp: 380, atk: 24, def: 14, spd: 1.0, role: "Paladin" },
    { id: 23, name: "Necro", hp: 250, atk: 26, def: 8, spd: 1.05, role: "Necro" },
    { id: 24, name: "Mindcroc", hp: 300, atk: 22, def: 12, spd: 0.8, role: "Controller" },
    { id: 25, name: "Priest", hp: 290, atk: 20, def: 10, spd: 1.1, role: "Cleric" },
    { id: 26, name: "Cosmic", hp: 320, atk: 26, def: 12, spd: 1.1, role: "Mage" },
    { id: 27, name: "Raging Bull", hp: 500, atk: 30, def: 10, spd: 0.85, role: "Berserker" },
    { id: 28, name: "Nightblade", hp: 200, atk: 38, def: 3, spd: 1.4, role: "Rogue" },
    { id: 29, name: "Serpent", hp: 310, atk: 26, def: 10, spd: 1.05, role: "Berserker" },
    { id: 30, name: "Bonelord", hp: 270, atk: 24, def: 9, spd: 1.0, role: "Necro" }
];

const TEAMS = [
    { name: "Crimson Horde", color: "#DC143C" },
    { name: "Azure Arcanum", color: "#4169E1" },
    { name: "Emerald Rangers", color: "#228B22" },
    { name: "Shadow Guild", color: "#8B008B" },
    { name: "Golden Order", color: "#FF8C00" }
];

// Seeded RNG for deterministic matches
class SeededRNG {
    constructor(seed) {
        this.seed = this.hash(seed);
    }
    
    hash(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) {
            h = ((h << 5) - h) + str.charCodeAt(i);
            h = h & 0x7fffffff;
        }
        return h || 1;
    }
    
    next() {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return this.seed / 0x7fffffff;
    }
    
    shuffle(arr) {
        const result = [...arr];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(this.next() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }
}

function calcPower(fighters) {
    return fighters.reduce((s, f) => s + f.hp * 0.3 + f.atk * 2 + f.def * 1.5 + f.spd * 20, 0);
}

function calcOdds(a, b) {
    const pa = calcPower(a), pb = calcPower(b), t = pa + pb;
    return {
        A: Math.max(1.1, Math.round((t / pa) * 0.95 * 100) / 100),
        B: Math.max(1.1, Math.round((t / pb) * 0.95 * 100) / 100)
    };
}

function generateMatch(matchId) {
    const seed = `SAVAGE-${matchId}`;
    const rng = new SeededRNG(seed);
    
    const shuffled = rng.shuffle([...FIGHTERS]);
    const teamAFighters = shuffled.slice(0, TEAM_SIZE);
    const teamBFighters = shuffled.slice(TEAM_SIZE, TEAM_SIZE * 2);
    
    const teamTemplates = rng.shuffle([...TEAMS]);
    const odds = calcOdds(teamAFighters, teamBFighters);
    
    // Calculate match timing based on 5-minute intervals
    const epoch = new Date('2026-01-01T00:00:00Z').getTime();
    const matchStartTime = epoch + (matchId * MATCH_INTERVAL);
    const bettingEndsAt = matchStartTime;
    const battleEndsAt = matchStartTime + 240000; // 4 min battle
    
    return {
        matchId: `SAVAGE-${matchId}`,
        seed,
        status: Date.now() < bettingEndsAt ? 'betting' : Date.now() < battleEndsAt ? 'live' : 'ended',
        bettingEndsAt,
        startsAt: matchStartTime,
        endsAt: battleEndsAt,
        teamA: {
            name: teamTemplates[0].name,
            color: teamTemplates[0].color,
            fighters: teamAFighters,
            totalPower: calcPower(teamAFighters)
        },
        teamB: {
            name: teamTemplates[1].name,
            color: teamTemplates[1].color,
            fighters: teamBFighters,
            totalPower: calcPower(teamBFighters)
        },
        odds
    };
}

function getCurrentMatchId() {
    const epoch = new Date('2026-01-01T00:00:00Z').getTime();
    const now = Date.now();
    return Math.floor((now - epoch) / MATCH_INTERVAL) + 1;
}

export default function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
        const matchId = getCurrentMatchId();
        const match = generateMatch(matchId);
        
        return res.status(200).json(match);
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
}
