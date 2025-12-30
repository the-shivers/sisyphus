import { Hono } from 'hono';
import {
  getLeaderboard,
  getPlayerRank,
  getTotalPlayers,
  getActivePlayers,
  getSurvivorship,
  getDeathStats,
} from '../db/queries.js';

const app = new Hono();

/**
 * GET /api/stats/leaderboard
 * Get top players by current height
 * Query: ?limit=100&offset=0
 * Header: X-Player-ID (optional - includes your rank if provided)
 */
app.get('/leaderboard', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '100'), 100);
  const offset = parseInt(c.req.query('offset') || '0');
  const playerId = c.req.header('X-Player-ID');

  const leaderboard = getLeaderboard(limit, offset);
  const total = getTotalPlayers();

  let yourRank: number | null = null;
  if (playerId) {
    yourRank = getPlayerRank(playerId);
  }

  return c.json({
    leaderboard,
    total,
    yourRank,
  });
});

/**
 * GET /api/stats/survivorship
 * Get survivorship curve data
 * Shows what percentage of players made it to each height
 */
app.get('/survivorship', async (c) => {
  const totalPlayers = getTotalPlayers();
  const activePlayers = getActivePlayers(7); // Active in last 7 days
  const survivorship = getSurvivorship();

  // Calculate percentages
  const survivorshipWithPercent = survivorship.map((entry) => ({
    height: entry.height,
    playersReached: entry.players_reached,
    reachedPercent:
      totalPlayers > 0
        ? Math.round((entry.players_reached / totalPlayers) * 1000) / 10
        : 0,
    playersSurviving: entry.players_surviving,
    survivingPercent:
      totalPlayers > 0
        ? Math.round((entry.players_surviving / totalPlayers) * 1000) / 10
        : 0,
  }));

  return c.json({
    totalPlayers,
    activePlayers,
    survivorship: survivorshipWithPercent,
  });
});

/**
 * GET /api/stats/deaths
 * Get death statistics
 */
app.get('/deaths', async (c) => {
  const stats = getDeathStats();

  return c.json({
    totalDeaths: stats.totalDeaths,
    averageHeightAtDeath: Math.round(stats.averageHeightAtDeath * 10) / 10,
    longestStreakLost: stats.longestStreakLost,
  });
});

/**
 * GET /api/stats/summary
 * Get a summary of all stats
 */
app.get('/summary', async (c) => {
  const totalPlayers = getTotalPlayers();
  const activePlayers = getActivePlayers(7);
  const deathStats = getDeathStats();

  return c.json({
    totalPlayers,
    activePlayers,
    totalDeaths: deathStats.totalDeaths,
    averageHeightAtDeath: Math.round(deathStats.averageHeightAtDeath * 10) / 10,
  });
});

export default app;
