// POST /api/account/withdraw - Request withdrawal to external wallet

// Bankr API for sending tokens
const BANKR_API_KEY = process.env.BANKR_API_KEY;
const BANKR_API_URL = 'https://api.bankr.bot';

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
  const { toAddress, amount, token = 'USDC' } = req.body;

  if (!agentId) {
    return res.status(400).json({ error: 'agentId required' });
  }

  if (!toAddress) {
    return res.status(400).json({ error: 'toAddress required (your wallet address)' });
  }

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'amount must be positive' });
  }

  // Validate address format (basic check)
  if (!toAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
    return res.status(400).json({ error: 'Invalid wallet address format' });
  }

  // Demo token check
  if (token === 'DEMO') {
    return res.status(400).json({ 
      error: 'Cannot withdraw DEMO tokens',
      hint: 'DEMO tokens are for testing only and have no value'
    });
  }

  // Minimum withdrawal amounts
  const minimums = { USDC: 5, ETH: 0.001, SAVAGE: 50 };
  if (amount < (minimums[token] || 1)) {
    return res.status(400).json({ 
      error: `Minimum withdrawal for ${token} is ${minimums[token]}` 
    });
  }

  // TODO: In production:
  // 1. Check agent's balance in database
  // 2. Verify sufficient funds
  // 3. Create pending withdrawal record
  // 4. Call Bankr API to send tokens
  // 5. Update balance on confirmation

  // For MVP: Queue withdrawal request
  const withdrawalId = `wd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // If Bankr API key is configured, attempt to process
  if (BANKR_API_KEY) {
    try {
      // Submit to Bankr
      const response = await fetch(`${BANKR_API_URL}/agent/prompt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': BANKR_API_KEY
        },
        body: JSON.stringify({
          prompt: `Send ${amount} ${token} to ${toAddress} on Base`
        })
      });

      const result = await response.json();

      if (result.jobId) {
        return res.status(200).json({
          success: true,
          withdrawalId,
          status: 'processing',
          bankrJobId: result.jobId,
          agentId,
          toAddress,
          amount,
          token,
          message: 'Withdrawal submitted to Bankr for processing',
          estimatedTime: '2-5 minutes',
          checkStatus: `/api/account/withdrawal/${withdrawalId}`
        });
      }
    } catch (error) {
      console.error('Bankr API error:', error);
    }
  }

  // Fallback: Queue for manual processing
  return res.status(200).json({
    success: true,
    withdrawalId,
    status: 'queued',
    agentId,
    toAddress,
    amount,
    token,
    message: 'Withdrawal queued for processing',
    note: 'Manual review required - withdrawals processed within 24h',
    estimatedTime: '1-24 hours'
  });
}
