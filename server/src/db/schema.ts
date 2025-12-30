import Database from 'better-sqlite3';
import path from 'path';

// Database path - use persistent volume in production
const DB_PATH = process.env.DATABASE_PATH || path.join(import.meta.dirname, '../../data/sisyphus.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export function initDatabase(): void {
  const db = getDb();

  // Create tables
  db.exec(`
    -- Players table
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      height INTEGER NOT NULL DEFAULT 0,
      streak INTEGER NOT NULL DEFAULT 0,
      last_played_date TEXT,
      total_pushes INTEGER NOT NULL DEFAULT 0,
      max_height INTEGER NOT NULL DEFAULT 0,
      death_count INTEGER NOT NULL DEFAULT 0,
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Daily plays audit log
    CREATE TABLE IF NOT EXISTS daily_plays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL REFERENCES players(id),
      play_date TEXT NOT NULL,
      played_at TEXT NOT NULL DEFAULT (datetime('now')),
      height_after INTEGER NOT NULL,
      streak_at_time INTEGER NOT NULL,
      UNIQUE(player_id, play_date)
    );

    -- Deaths table
    CREATE TABLE IF NOT EXISTS deaths (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL REFERENCES players(id),
      died_at TEXT NOT NULL DEFAULT (datetime('now')),
      height_lost INTEGER NOT NULL,
      streak_lost INTEGER NOT NULL,
      days_missed INTEGER NOT NULL DEFAULT 1
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_players_height ON players(height DESC);
    CREATE INDEX IF NOT EXISTS idx_players_max_height ON players(max_height DESC);
    CREATE INDEX IF NOT EXISTS idx_daily_plays_player ON daily_plays(player_id);
    CREATE INDEX IF NOT EXISTS idx_daily_plays_date ON daily_plays(play_date);
    CREATE INDEX IF NOT EXISTS idx_deaths_player ON deaths(player_id);
    CREATE INDEX IF NOT EXISTS idx_deaths_height ON deaths(height_lost DESC);
  `);

  console.log('Database initialized at:', DB_PATH);
}
