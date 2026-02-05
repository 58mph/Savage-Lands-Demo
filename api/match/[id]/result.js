// GET /api/match/[id]/result - Get match result with full battle log

const TEAM_SIZE = 5;
const MATCH_TIME = 240000;

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

class SeededRNG {
    constructor(seed) {
        this.seed = this.hash(seed);
    }
    hash(str) {
        let h = 0;
        for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i) & 0x7fffffff;
        return h || 1;
    }
    next() {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return this.seed / 0x7fffffff;
    }
    int(a, b) { return Math.floor(this.next() * (b - a + 1)) + a; }
    shuffle(arr) {
        const r = [...arr];
        for (let i = r.length - 1; i > 0; i--) {
            const j = Math.floor(this.next() * (i + 1));
            [r[i], r[j]] = [r[j], r[i]];
        }
        return r;
    }
}

function simulateBattle(matchId) {
    const seed = `SAVAGE-${matchId}`;
    const rng = new SeededRNG(seed);
    
    const shuffled = rng.shuffle([...FIGHTERS]);
    const teamA = shuffled.slice(0, TEAM_SIZE).map(f => ({ ...f, hp: f.hp, maxHp: f.hp, alive: true, team: 'A' }));
    const teamB = shuffled.slice(TEAM_SIZE, TEAM_SIZE * 2).map(f => ({ ...f, hp: f.hp, maxHp: f.hp, alive: true, team: 'B' }));
    
    const teamTemplates = rng.shuffle([...TEAMS]);
    const battleLog = [];
    let time = 0;
    let winner = null;
    
    while (time < MATCH_TIME) {
        const aliveA = teamA.filter(f => f.alive);
        const aliveB = teamB.filter(f => f.alive);
        
        if (aliveA.length === 0) { winner = 'B'; break; }
        if (aliveB.length === 0) { winner = 'A'; break; }
        
        // Each fighter attacks
        [...aliveA, ...aliveB].forEach(f => {
            const enemies = f.team === 'A' ? aliveB : aliveA;
            if (enemies.length === 0) return;
            
            const target = enemies[rng.int(0, enemies.length - 1)];
            if (rng.next() < 0.65 + f.spd * 0.1) {
                let dmg = f.atk + rng.int(-3, 5);
                const crit = rng.next() < 0.1;
                if (crit) dmg = Math.floor(dmg * 1.8);
                dmg = Math.max(1, dmg - Math.floor(target.def * 0.3));
                target.hp -= dmg;
                
                battleLog.push({ time, type: 'attack', attacker: f.name, target: target.name, damage: dmg, crit });
                
                if (target.hp <= 0) {
                    target.hp = 0;
                    target.alive = false;
                    battleLog.push({ time, type: 'kill', killer: f.name, victim: target.name });
                }
            }
        });
        
        time += 100;
    }
    
    // Determine winner if time ran out
    if (!winner) {
        const aliveA = teamA.filter(f => f.alive).length;
        const aliveB = teamB.filter(f => f.alive).length;
        if (aliveA > aliveB) winner = 'A';
        else if (aliveB > aliveA) winner = 'B';
        else {
            const hpA = teamA.reduce((s, f) => s + f.hp, 0);
            const hpB = teamB.reduce((s, f) => s + f.hp, 0);
            winner = hpA >= hpB ? 'A' : 'B';
        }
    }
    
    return {
        seed,
        winner,
        duration: time,
        teamA: {
            name: teamTemplates[0].name,
            fighters: teamA.map(f => ({ id: f.id, name: f.name, finalHp: f.hp, alive: f.alive })),
            alive: teamA.filter(f => f.alive).length,
            totalHp: teamA.reduce((s, f) => s + f.hp, 0)
        },
        teamB: {
            name: teamTemplates[1].name,
            fighters: teamB.map(f => ({ id: f.id, name: f.name, finalHp: f.hp, alive: f.alive })),
            alive: teamB.filter(f => f.alive).length,
            totalHp: teamB.reduce((s, f) => s + f.hp, 0)
        },
        battleLog
    };
}

export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    
    try {
        const { id } = req.query;
        
        // Extract numeric match ID
        const matchId = id.replace('SAVAGE-', '');
        
        if (!matchId || isNaN(matchId)) {
            return res.status(400).json({ error: 'Invalid match ID' });
        }
        
        const result = simulateBattle(matchId);
        
        return res.status(200).json({
            matchId: `SAVAGE-${matchId}`,
            status: 'ended',
            ...result
        });
        
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
}
