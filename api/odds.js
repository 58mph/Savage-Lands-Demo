// GET /api/odds - Get all current odds for all bet types
export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // In production, this would fetch from match state
  // For now, generate sample odds structure
  const { matchId, teams } = req.query;
  
  // Parse teams if provided (JSON string)
  let teamData = [];
  try {
    if (teams) {
      teamData = JSON.parse(teams);
    }
  } catch (e) {
    // Default teams if not provided
    teamData = [
      { name: 'Team 1', power: 700 },
      { name: 'Team 2', power: 650 },
      { name: 'Team 3', power: 720 },
      { name: 'Team 4', power: 680 },
      { name: 'Team 5', power: 690 },
    ];
  }

  // Calculate odds for each bet type
  const totalPower = teamData.reduce((s, t) => s + (t.power || 700), 0);
  const HOUSE_EDGE = {
    winner: 0.92,    // 8% edge
    top2: 0.95,      // 5% edge
    top3: 0.95,      // 5% edge
    firstBlood: 0.90, // 10% edge
    props: 0.90,     // 10% edge
    exotic: 0.88,    // 12% edge
  };

  const odds = {
    matchId: matchId || 'current',
    timestamp: Date.now(),
    
    // Winner bets (existing)
    winner: teamData.map((t, i) => ({
      team: i,
      name: t.name,
      odds: Math.max(1.05, parseFloat((totalPower / (t.power || 700) * HOUSE_EDGE.winner).toFixed(2)))
    })),
    
    // Place bets - Top 2 finish
    top2: teamData.map((t, i) => {
      const prob = ((t.power || 700) / totalPower) * 1.8; // ~2 teams can place
      return {
        team: i,
        name: t.name,
        odds: Math.max(1.05, parseFloat((1 / prob * HOUSE_EDGE.top2).toFixed(2)))
      };
    }),
    
    // Place bets - Top 3 finish
    top3: teamData.map((t, i) => {
      const prob = ((t.power || 700) / totalPower) * 2.5; // ~3 teams can place
      return {
        team: i,
        name: t.name,
        odds: Math.max(1.05, parseFloat((1 / prob * HOUSE_EDGE.top3).toFixed(2)))
      };
    }),
    
    // First Blood - which team loses a fighter first (inverse of power)
    firstBlood: teamData.map((t, i) => {
      const invPower = totalPower - (t.power || 700);
      const prob = invPower / (totalPower * 4);
      return {
        team: i,
        name: t.name,
        odds: Math.max(1.5, parseFloat((1 / prob * HOUSE_EDGE.firstBlood).toFixed(2)))
      };
    }),
    
    // First Eliminated
    firstEliminated: teamData.map((t, i) => {
      const invPower = totalPower - (t.power || 700);
      const prob = invPower / (totalPower * 4);
      return {
        team: i,
        name: t.name,
        odds: Math.max(2.0, parseFloat((1 / prob * HOUSE_EDGE.firstBlood).toFixed(2)))
      };
    }),
    
    // Props
    props: {
      totalKills: {
        line: 12,
        over: { odds: 1.90 },
        under: { odds: 1.90 }
      },
      matchDuration: {
        line: 120, // seconds
        over: { odds: 1.85 },
        under: { odds: 1.95 }
      },
      critCount: {
        line: 8,
        over: { odds: 1.95 },
        under: { odds: 1.85 }
      }
    },
    
    // Exotic - Exacta (pick 1st and 2nd in order)
    exacta: {
      description: "Pick 1st AND 2nd place in exact order",
      baseOdds: 15.0,
      combinations: teamData.length * (teamData.length - 1)
    },
    
    // Exotic - Quinella (pick top 2 any order)
    quinella: {
      description: "Pick top 2 finishers in any order",
      baseOdds: 8.0,
      combinations: (teamData.length * (teamData.length - 1)) / 2
    }
  };

  res.status(200).json(odds);
}
