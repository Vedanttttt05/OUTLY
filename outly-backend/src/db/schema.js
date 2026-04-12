import pool from './connection.js';

const schemaStatements = [
  `CREATE EXTENSION IF NOT EXISTS postgis;`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    first_name TEXT,
    last_name TEXT,
    birthday DATE,
    profile_image_url TEXT,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    age INTEGER,
    hobbies TEXT[] NOT NULL DEFAULT '{}',
    interests TEXT[] NOT NULL DEFAULT '{}',
    bio TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday DATE;`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url TEXT;`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS age INTEGER;`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS hobbies TEXT[] NOT NULL DEFAULT '{}';`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS interests TEXT[] NOT NULL DEFAULT '{}';`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`,

  `ALTER TABLE events ADD COLUMN IF NOT EXISTS max_participants INTEGER;`,
  `ALTER TABLE events ADD COLUMN IF NOT EXISTS event_date_time TIMESTAMPTZ;`,
  `ALTER TABLE events ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;`,
  `ALTER TABLE events ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;`,
  `ALTER TABLE events ADD COLUMN IF NOT EXISTS creator_id TEXT;`,
  `ALTER TABLE events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`,

  `ALTER TABLE event_participants ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'accepted';`,
  `ALTER TABLE event_participants ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_event_participants_user_event_unique ON event_participants (user_id, event_id);`,

  `CREATE TABLE IF NOT EXISTS blocked_users (
    blocker_id TEXT NOT NULL,
    blocked_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (blocker_id, blocked_id)
  );`,

  `CREATE TABLE IF NOT EXISTS reports (
    id BIGSERIAL PRIMARY KEY,
    reporter_id TEXT NOT NULL,
    reported_user_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_name TEXT;`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_profile_image TEXT;`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_verified BOOLEAN DEFAULT FALSE;`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_id TEXT;`,

  `ALTER TABLE identity_verification_requests ADD COLUMN IF NOT EXISTS document_image_url TEXT;`,
  `ALTER TABLE identity_verification_requests ADD COLUMN IF NOT EXISTS aadhaar_image_url TEXT;`,
  `ALTER TABLE identity_verification_requests ADD COLUMN IF NOT EXISTS selfie_image_url TEXT;`
];

export const initializeSchema = async () => {
  for (const statement of schemaStatements) {
    await pool.query(statement);
  }
};
