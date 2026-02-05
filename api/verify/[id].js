// GET /api/verify/{matchId} - Verify a match seed is fair
export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  
  if (!id) {
    return res.status(400).json({ error: 'Match ID required' });
  }

  const matchId = parseInt(id, 10);
  
  if (isNaN(matchId) || matchId < 1) {
    return res.status(400).json({ error: 'Invalid match ID' });
  }

  // Server secret - same as client
  const SERVER_SECRET = 'SAVAGE_ARENA_V1_2026';
  
  // Hash function - same as client
  function hashSeed(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  // Generate the expected seed
  const combined = `${SERVER_SECRET}:${matchId}`;
  const hash = hashSeed(combined);
  const expectedSeed = `SAVAGE-${matchId}-${hash}`;

  res.status(200).json({
    matchId,
    seed: expectedSeed,
    serverSecret: SERVER_SECRET,
    verification: {
      method: 'hash(SERVER_SECRET + ":" + matchId)',
      hash: hash,
      verifiable: true
    },
    instructions: [
      '1. The seed is deterministic based on match ID',
      '2. Anyone can verify by computing hash(SERVER_SECRET:matchId)',
      '3. The same seed always produces the same match outcome',
      '4. Run the match client-side with this seed to verify results'
    ]
  });
}
