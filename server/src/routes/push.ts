import { Hono } from 'hono';
import {
  getPlayer,
  hasPlayedDate,
  recordPush,
  recordDeath,
} from '../db/queries.js';
import {
  isConsecutiveDay,
  isSameDay,
  daysBetween,
  isValidDateString,
} from '../utils/date.js';

const app = new Hono();

// Simple in-memory rate limiting
const pushAttempts = new Map<string, number[]>();
const WINDOW_MS = 60000; // 1 minute
const MAX_ATTEMPTS = 10;

function isRateLimited(playerId: string): boolean {
  const now = Date.now();
  const attempts = pushAttempts.get(playerId) || [];

  // Remove old attempts
  const recentAttempts = attempts.filter((t) => now - t < WINDOW_MS);

  if (recentAttempts.length >= MAX_ATTEMPTS) {
    return true;
  }

  recentAttempts.push(now);
  pushAttempts.set(playerId, recentAttempts);
  return false;
}

/**
 * POST /api/push
 * Record a boulder push
 * Header: X-Player-ID (required)
 * Body: { localDate: "YYYY-MM-DD" }
 */
app.post('/', async (c) => {
  const playerId = c.req.header('X-Player-ID');

  if (!playerId) {
    return c.json(
      { error: 'missing_player_id', message: 'X-Player-ID header required' },
      400
    );
  }

  // Rate limiting
  if (isRateLimited(playerId)) {
    return c.json(
      { error: 'rate_limited', message: 'Too many requests. Try again later.' },
      429
    );
  }

  // Get player
  const player = getPlayer(playerId);
  if (!player) {
    return c.json({ error: 'invalid_player', message: 'Player not found' }, 404);
  }

  // Parse body
  let body: { localDate?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid_body', message: 'Invalid JSON body' }, 400);
  }

  const { localDate } = body;

  if (!localDate || !isValidDateString(localDate)) {
    return c.json(
      { error: 'invalid_date', message: 'localDate required (YYYY-MM-DD)' },
      400
    );
  }

  // Check if already played this date
  if (hasPlayedDate(playerId, localDate)) {
    return c.json(
      { error: 'already_played_today', message: "You've already pushed today!" },
      409
    );
  }

  // Check if rollback is needed (missed days)
  if (
    player.last_played_date &&
    player.height > 0 &&
    !isSameDay(player.last_played_date, localDate) &&
    !isConsecutiveDay(player.last_played_date, localDate)
  ) {
    // Player missed at least one day - need to rollback first
    const daysMissed = daysBetween(player.last_played_date, localDate) - 1;

    // Record the death
    recordDeath(playerId, player.height, player.streak, daysMissed);

    return c.json(
      {
        error: 'rollback_required',
        message: 'You missed a day! The boulder rolled back.',
        heightLost: player.height,
        streakLost: player.streak,
        daysMissed,
      },
      409
    );
  }

  // Valid push - increment and record
  const newHeight = player.height + 1;
  const newStreak = player.streak + 1;

  recordPush(playerId, localDate, newHeight, newStreak);

  return c.json({
    success: true,
    height: newHeight,
    streak: newStreak,
  });
});

/**
 * POST /api/push/acknowledge-rollback
 * Acknowledge a rollback (after client animates it)
 * This records the death and resets the player, allowing them to push again
 */
app.post('/acknowledge-rollback', async (c) => {
  const playerId = c.req.header('X-Player-ID');

  if (!playerId) {
    return c.json(
      { error: 'missing_player_id', message: 'X-Player-ID header required' },
      400
    );
  }

  const player = getPlayer(playerId);
  if (!player) {
    return c.json({ error: 'invalid_player', message: 'Player not found' }, 404);
  }

  // If player still has height, record the death and reset them
  if (player.height > 0) {
    recordDeath(playerId, player.height, player.streak, 1);
  }

  // Fetch updated player state
  const updatedPlayer = getPlayer(playerId);

  return c.json({
    success: true,
    height: updatedPlayer?.height ?? 0,
    streak: updatedPlayer?.streak ?? 0,
  });
});

export default app;
