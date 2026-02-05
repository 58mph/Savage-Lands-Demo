// GET /api/balance - Get agent's current balance

// In-memory storage (use KV/DB in production)
const balances = new Map();
const DEFAULT_BALANCE = 1000;

function getBalance(agentId) {
    if (!balances.has(agentId)) {
        balances.set(agentId, DEFAULT_BALANCE);
    }
    return balances.get(agentId);
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
        // Get agent ID from auth header
        const authHeader = req.headers.authorization;
        const agentId = authHeader?.replace('Bearer ', '') || 'anonymous';
        
        const balance = getBalance(agentId);
        
        return res.status(200).json({
            agentId,
            balance,
            currency: 'SAVAGE',
            pendingBets: 0, // Would calculate from bets in production
            availableBalance: balance
        });
        
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
}
