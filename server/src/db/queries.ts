import { getDb } from './schema.js';

export interface Player {
  id: string;
  created_at: string;
  height: number;
  streak: number;
  last_played_date: string | null;
  total_pushes: number;
  max_height: number;
  death_count: number;
  last_seen_at: string;
}

export interface DailyPlay {
  id: number;
  player_id: string;
  play_date: string;
  played_at: string;
  height_after: number;
  streak_at_time: number;
}

export interface Death {
  id: number;
  player_id: string;
  died_at: string;
  height_lost: number;
  streak_lost: number;
  days_missed: number;
}

// Player queries
export function createPlayer(id: string): Player {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO players (id) VALUES (?)
    RETURNING *
  `);
  return stmt.get(id) as Player;
}

export function getPlayer(id: string): Player | undefined {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM players WHERE id = ?');
  return stmt.get(id) as Player | undefined;
}

export function updatePlayerLastSeen(id: string): void {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE players SET last_seen_at = datetime('now') WHERE id = ?
  `);
  stmt.run(id);
}

// Push-related queries
export function recordPush(
  playerId: string,
  playDate: string,
  newHeight: number,
  newStreak: number
): void {
  const db = getDb();

  const updatePlayer = db.prepare(`
    UPDATE players SET
      height = ?,
      streak = ?,
      last_played_date = ?,
      total_pushes = total_pushes + 1,
      max_height = MAX(max_height, ?),
      last_seen_at = datetime('now')
    WHERE id = ?
  `);

  const insertPlay = db.prepare(`
    INSERT INTO daily_plays (player_id, play_date, height_after, streak_at_time)
    VALUES (?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    updatePlayer.run(newHeight, newStreak, playDate, newHeight, playerId);
    insertPlay.run(playerId, playDate, newHeight, newStreak);
  });

  transaction();
}

export function hasPlayedDate(playerId: string, playDate: string): boolean {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT 1 FROM daily_plays WHERE player_id = ? AND play_date = ?
  `);
  return stmt.get(playerId, playDate) !== undefined;
}

// Death-related queries
export function recordDeath(
  playerId: string,
  heightLost: number,
  streakLost: number,
  daysMissed: number
): void {
  const db = getDb();

  const insertDeath = db.prepare(`
    INSERT INTO deaths (player_id, height_lost, streak_lost, days_missed)
    VALUES (?, ?, ?, ?)
  `);

  const resetPlayer = db.prepare(`
    UPDATE players SET
      height = 0,
      streak = 0,
      death_count = death_count + 1,
      last_seen_at = datetime('now')
    WHERE id = ?
  `);

  const transaction = db.transaction(() => {
    insertDeath.run(playerId, heightLost, streakLost, daysMissed);
    resetPlayer.run(playerId);
  });

  transaction();
}

// Leaderboard queries
export interface LeaderboardEntry {
  rank: number;
  id: string;
  height: number;
  streak: number;
  max_height: number;
}

export function getLeaderboard(limit: number = 100, offset: number = 0): LeaderboardEntry[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT
      ROW_NUMBER() OVER (ORDER BY height DESC, streak DESC) as rank,
      id,
      height,
      streak,
      max_height
    FROM players
    WHERE height > 0
    ORDER BY height DESC, streak DESC
    LIMIT ? OFFSET ?
  `);
  return stmt.all(limit, offset) as LeaderboardEntry[];
}

export function getPlayerRank(playerId: string): number | null {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT rank FROM (
      SELECT
        id,
        ROW_NUMBER() OVER (ORDER BY height DESC, streak DESC) as rank
      FROM players
      WHERE height > 0
    ) WHERE id = ?
  `);
  const result = stmt.get(playerId) as { rank: number } | undefined;
  return result?.rank ?? null;
}

export function getTotalPlayers(): number {
  const db = getDb();
  const stmt = db.prepare('SELECT COUNT(*) as count FROM players');
  return (stmt.get() as { count: number }).count;
}

export function getActivePlayers(sinceDays: number = 7): number {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM players
    WHERE last_seen_at > datetime('now', '-' || ? || ' days')
  `);
  return (stmt.get(sinceDays) as { count: number }).count;
}

// Survivorship queries
export interface SurvivorshipEntry {
  height: number;
  players_reached: number;
  players_surviving: number;
}

export function getSurvivorship(): SurvivorshipEntry[] {
  const db = getDb();

  // Get players who ever reached each height (via max_height)
  // and players currently at or above each height
  const stmt = db.prepare(`
    WITH heights AS (
      SELECT DISTINCT max_height as height FROM players WHERE max_height > 0
      UNION
      SELECT DISTINCT height FROM players WHERE height > 0
    )
    SELECT
      h.height,
      (SELECT COUNT(*) FROM players WHERE max_height >= h.height) as players_reached,
      (SELECT COUNT(*) FROM players WHERE height >= h.height) as players_surviving
    FROM heights h
    ORDER BY h.height ASC
  `);

  return stmt.all() as SurvivorshipEntry[];
}

export function getDeathStats(): {
  totalDeaths: number;
  averageHeightAtDeath: number;
  longestStreakLost: number;
} {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT
      COUNT(*) as totalDeaths,
      COALESCE(AVG(height_lost), 0) as averageHeightAtDeath,
      COALESCE(MAX(streak_lost), 0) as longestStreakLost
    FROM deaths
  `);
  return stmt.get() as {
    totalDeaths: number;
    averageHeightAtDeath: number;
    longestStreakLost: number;
  };
}
