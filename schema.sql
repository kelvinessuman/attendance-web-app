-- ==========================================
-- Attendance App - PostgreSQL Schema
-- Database name: attendance_db
-- ==========================================
-- Run this AFTER creating the database, e.g.:
--   createdb -U postgres -p 5432 attendance_db
--   psql -U postgres -p 5432 -d attendance_db -f schema.sql

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schedules JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, student_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  group_name TEXT NOT NULL,
  date TEXT NOT NULL,          -- display only, e.g. "2026-07-31"
  start_time TEXT NOT NULL,    -- display only, e.g. "09:00"
  end_time TEXT NOT NULL,      -- display only, e.g. "10:00"
  starts_at TIMESTAMPTZ NOT NULL,  -- source of truth for when the session opened
  expires_at TIMESTAMPTZ NOT NULL, -- source of truth for when the session (and its QR code) expires
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration for existing databases created before starts_at/expires_at existed:
-- ALTER TABLE sessions ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;
-- ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
-- UPDATE sessions SET starts_at = created_at, expires_at = created_at + interval '1 hour' WHERE expires_at IS NULL;
-- ALTER TABLE sessions ALTER COLUMN starts_at SET NOT NULL;
-- ALTER TABLE sessions ALTER COLUMN expires_at SET NOT NULL;

CREATE TABLE IF NOT EXISTS checkins (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  name TEXT NOT NULL,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now(),
  photo_base64 TEXT
);

CREATE TABLE IF NOT EXISTS daily_reports (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  date TEXT NOT NULL,
  session_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stats JSONB NOT NULL,
  records JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS cumulative_reports (
  group_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stats JSONB NOT NULL,
  records JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_groups_created_by ON groups(created_by);
CREATE INDEX IF NOT EXISTS idx_participants_group ON participants(group_id);
CREATE INDEX IF NOT EXISTS idx_sessions_group ON sessions(group_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_checkins_session ON checkins(session_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_group ON daily_reports(group_id);
