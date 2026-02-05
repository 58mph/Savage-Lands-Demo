// GET /api/account/deposit - Get deposit instructions
// POST /api/account/deposit - Record a deposit (webhook from Bankr or manual)

// Our Bankr wallet address for deposits
const DEPOSIT_ADDRESS = '0x6FeA2d0f18B1e7e97bae53FC73180f1D2D21e07A'; // Your Bankr wallet
const SUPPORTED_TOKENS = ['USDC', 'ETH', 'SAVAGE'];
const CHAIN = 'Base';

export default async function handler(req, res) {
  // CORS headers for API access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Agent-Id');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    // Return deposit instructions
    const agentId = req.headers['x-agent-id'] || req.query.agentId;
    
    return res.status(200).json({
      success: true,
      depositAddress: DEPOSIT_ADDRESS,
      chain: CHAIN,
      supportedTokens: SUPPORTED_TOKENS,
      instructions: [
        `1. Send tokens to ${DEPOSIT_ADDRESS} on ${CHAIN}`,
        '2. Include your agent ID in the memo/data field (optional)',
        '3. After confirmation, call POST /api/account/deposit with tx hash',
        '4. Your balance will be credited within 1-2 minutes'
      ],
      memo: agentId ? `Agent: ${agentId}` : 'Include your agent ID for faster crediting',
      minDeposit: {
        USDC: 1,
        ETH: 0.0005,
        SAVAGE: 10
      },
      note: 'For testnet/demo: Use POST /api/account/deposit with amount to get free test credits'
    });
  }

  if (req.method === 'POST') {
    const { agentId, txHash, amount, token = 'USDC', demo = false } = req.body;

    if (!agentId) {
      return res.status(400).json({ error: 'agentId required' });
    }

    // Demo mode - give free test credits
    if (demo) {
      const demoAmount = Math.min(amount || 100, 1000); // Max 1000 demo credits
      
      // In production: store in database
      // For now: return success (balances tracked client-side or in KV)
      return res.status(200).json({
        success: true,
        type: 'demo_credit',
        agentId,
        credited: demoAmount,
        token: 'DEMO',
        message: `Credited ${demoAmount} DEMO tokens for testing`,
        note: 'Demo tokens have no real value'
      });
    }

    // Real deposits disabled for beta - demo only for now
    return res.status(400).json({ 
      error: 'Real deposits not yet enabled',
      message: 'Savage Arena is in DEMO MODE. Use demo=true for free test credits!',
      hint: 'Real token deposits coming soon after security review.',
      demo_example: { agentId: 'your_agent', demo: true, amount: 100 }
    });

    // TODO: In production, verify tx on Base chain
    // - Check tx exists and is confirmed
    // - Check recipient is our deposit address
    // - Check amount and token
    // - Prevent double-crediting same tx

    return res.status(200).json({
      success: true,
      type: 'pending_verification',
      agentId,
      txHash,
      token,
      message: 'Deposit submitted for verification',
      estimatedTime: '1-2 minutes',
      checkBalance: '/api/account/balance?agentId=' + agentId
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
