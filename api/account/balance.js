// GET /api/account/balance - Check agent balance
// For MVP: Uses Vercel KV or returns demo balance
// In production: Database lookup

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Agent-Id');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const agentId = req.headers['x-agent-id'] || req.query.agentId;

  if (!agentId) {
    return res.status(400).json({ 
      error: 'agentId required',
      hint: 'Pass as query param or X-Agent-Id header'
    });
  }

  // For MVP/Demo: Return a starting balance for new agents
  // In production: Look up in database
  
  // Simple deterministic "balance" based on agent ID for demo
  // Real implementation would use Vercel KV or database
  const hash = agentId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const isNewAgent = hash % 100 < 80; // 80% chance of being "new"
  
  const balance = {
    agentId,
    balances: {
      DEMO: isNewAgent ? 100 : (hash % 500) + 50, // Demo tokens
      USDC: 0,  // Real tokens start at 0
      SAVAGE: 0
    },
    totalValueUSD: 0,
    pendingDeposits: [],
    pendingWithdrawals: [],
    stats: {
      totalDeposited: 0,
      totalWithdrawn: 0,
      totalWagered: 0,
      totalWon: 0,
      netProfit: 0
    },
    note: 'New agents get 100 DEMO tokens free. Deposit real tokens to play for keeps!'
  };

  return res.status(200).json({
    success: true,
    ...balance
  });
}
