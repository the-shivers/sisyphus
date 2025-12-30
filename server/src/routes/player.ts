import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { createPlayer, getPlayer, updatePlayerLastSeen } from '../db/queries.js';
import { isConsecutiveDay, isSameDay, isValidDateString } from '../utils/date.js';

const app = new Hono();

export interface PlayerState {
  id: string;
  height: number;
  streak: number;
  lastPlayedDate: string | null;
  hasPlayedToday: boolean;
  needsRollback: boolean;
  previousHeight: number;
  totalPushes: number;
  maxHeight: number;
  deathCount: number;
}

/**
 * GET /api/player
 * Get or create player state
 * Header: X-Player-ID (optional - creates new player if missing)
 * Query: ?localDate=YYYY-MM-DD (required - client's current local date)
 */
app.get('/', async (c) => {
  const playerId = c.req.header('X-Player-ID');
  const localDate = c.req.query('localDate');

  if (!localDate || !isValidDateString(localDate)) {
    return c.json({ error: 'invalid_date', message: 'localDate query parameter required (YYYY-MM-DD)' }, 400);
  }

  let player;
  let isNew = false;

  if (playerId) {
    player = getPlayer(playerId);
    if (!player) {
      return c.json({ error: 'invalid_player', message: 'Player not found' }, 404);
    }
    updatePlayerLastSeen(playerId);
  } else {
    // Create new player
    const newId = uuidv4();
    player = createPlayer(newId);
    isNew = true;
  }

  // Check if localDate is before or on last_played_date (time traveling backwards)
  // In this case, treat as "already played" - no rollback, just can't play
  const isBeforeOrSameAsLastPlayed = player.last_played_date && localDate <= player.last_played_date;

  // Check if player has played today (or is time traveling to a date they've "passed")
  const hasPlayedToday = isBeforeOrSameAsLastPlayed;

  // Check if player needs rollback (missed days going FORWARD in time)
  let needsRollback = false;
  let previousHeight = 0;

  if (
    !isNew &&
    player.last_played_date &&
    player.height > 0 &&
    !isBeforeOrSameAsLastPlayed &&
    !isConsecutiveDay(player.last_played_date, localDate)
  ) {
    // Player missed at least one day going forward - they need to rollback
    needsRollback = true;
    previousHeight = player.height;
  }

  const state: PlayerState = {
    id: player.id,
    height: player.height,
    streak: player.streak,
    lastPlayedDate: player.last_played_date,
    hasPlayedToday,
    needsRollback,
    previousHeight,
    totalPushes: player.total_pushes,
    maxHeight: player.max_height,
    deathCount: player.death_count,
  };

  return c.json(state);
});

/**
 * POST /api/player/register
 * Create a new player
 */
app.post('/register', async (c) => {
  const newId = uuidv4();
  const player = createPlayer(newId);

  return c.json({ id: player.id });
});

export default app;
