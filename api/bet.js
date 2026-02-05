// POST /api/bet - Place one or more bets
// Supports both legacy single bet and multi-bet formats

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Agent-Id');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const agentId = req.headers['x-agent-id'] || req.body.agentId;
  const { matchId, bets, team, amount, type = 'winner', token = 'DEMO' } = req.body;

  if (!agentId) {
    return res.status(400).json({ 
      error: 'agentId required',
      hint: 'Pass in body or as X-Agent-Id header'
    });
  }

  // Support both single bet (legacy) and multi-bet formats
  let betSlip = [];
  
  if (bets && Array.isArray(bets)) {
    betSlip = bets;
  } else if (team !== undefined && amount !== undefined) {
    betSlip = [{ type, team, amount }];
  } else {
    return res.status(400).json({ 
      error: 'Invalid bet format',
      examples: {
        singleBet: { agentId: 'agent_123', matchId: 1, team: 0, amount: 10, type: 'winner' },
        multiBet: { agentId: 'agent_123', matchId: 1, bets: [{ type: 'winner', team: 0, amount: 10 }] }
      }
    });
  }

  // Validate bet types
  const validBetTypes = [
    'winner', 'top2', 'top3', 'firstBlood', 'firstElim',
    'killsOver', 'killsUnder', 'durationOver', 'durationUnder',
    'exacta', 'quinella'
  ];

  const processedBets = [];
  let totalWager = 0;

  for (const bet of betSlip) {
    if (!validBetTypes.includes(bet.type)) {
      return res.status(400).json({ 
        error: `Invalid bet type: ${bet.type}`,
        validTypes: validBetTypes 
      });
    }

    if (!bet.amount || bet.amount <= 0) {
      return res.status(400).json({ error: 'Bet amount must be positive' });
    }

    if (bet.amount < 1) {
      return res.status(400).json({ error: 'Minimum bet is 1 token' });
    }

    if (['winner', 'top2', 'top3', 'firstBlood', 'firstElim'].includes(bet.type)) {
      if (bet.team === undefined || bet.team < 0 || bet.team > 4) {
        return res.status(400).json({ error: 'Invalid team selection (0-4)' });
      }
    }

    totalWager += bet.amount;
    
    processedBets.push({
      id: `bet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ...bet,
      status: 'pending',
      placedAt: Date.now()
    });
  }

  // TODO: In production:
  // 1. Check agent balance >= totalWager
  // 2. Deduct from balance
  // 3. Store bets in database
  // 4. Return bet confirmation

  // For MVP: Accept bet and return confirmation
  const betConfirmation = {
    success: true,
    agentId,
    matchId: matchId || 'current',
    token,
    bets: processedBets,
    totalWager,
    summary: {
      betCount: processedBets.length,
      avgBetSize: (totalWager / processedBets.length).toFixed(2),
      betTypes: [...new Set(processedBets.map(b => b.type))]
    },
    message: `Placed ${processedBets.length} bet(s) totaling ${totalWager} ${token}`,
    checkResult: `/api/match/${matchId || 'current'}/result`,
    note: 'Results calculated when match ends'
  };

  return res.status(200).json(betConfirmation);
}
