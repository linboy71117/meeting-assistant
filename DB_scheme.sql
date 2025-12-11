CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 用戶表
CREATE TABLE IF NOT EXISTS users (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  email        TEXT UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 會議表（invite_code 即為 Google Meet 代碼）
CREATE TABLE IF NOT EXISTS meetings (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invite_code  VARCHAR(50) NOT NULL UNIQUE,  -- Google Meet 會議代碼（如 abc-defg-hij）
  title        TEXT NOT NULL,
  date         DATE,
  description  TEXT,
  summary      TEXT,
  expires_at   TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'active',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version      INT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_meetings_invite_code ON meetings(invite_code);

-- 會議參與者表
CREATE TABLE IF NOT EXISTS meeting_participants (
  id           BIGSERIAL PRIMARY KEY,
  meeting_id   UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         VARCHAR(20) NOT NULL DEFAULT 'participant',  -- 'host' 或 'participant'
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(meeting_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_participants_meeting ON meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON meeting_participants(user_id);


CREATE TABLE IF NOT EXISTS agenda_items (
  id          BIGSERIAL PRIMARY KEY,
  meeting_id  UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  order_index INT NOT NULL,      -- 對應你前端的 idx
  time        VARCHAR(10),       -- "09:00"
  title       TEXT NOT NULL,
  owner       TEXT,
  note        TEXT
);

CREATE TABLE IF NOT EXISTS brainstormings (
  id             BIGSERIAL PRIMARY KEY,
  meeting_id     UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  topic          TEXT NOT NULL,
  goals          TEXT,
  ai_summary     TEXT,
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brainstorming_items (
  id             BIGSERIAL PRIMARY KEY,
  meeting_id     UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  idea           TEXT NOT NULL,
  ai_response    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agenda_meeting ON agenda_items(meeting_id);
CREATE INDEX IF NOT EXISTS idx_brainstorming_meeting ON brainstormings(meeting_id);
CREATE INDEX IF NOT EXISTS idx_brainstorming_items_meeting ON brainstorming_items(meeting_id);
