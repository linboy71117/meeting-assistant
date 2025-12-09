CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 用戶表
CREATE TABLE users (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email                 TEXT UNIQUE,
  google_id             VARCHAR(255) NOT NULL UNIQUE,
  google_access_token   TEXT,  -- Google OAuth access token
  google_refresh_token  TEXT,  -- Google OAuth refresh token
  picture               TEXT,  -- 用戶頭像 URL
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);

-- 會議表（invite_code 即為 Google Meet 代碼）
CREATE TABLE meetings (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invite_code  VARCHAR(50) UNIQUE,  -- Google Meet 會議代碼（如 abc-defg-hij），可為 NULL，將於储存時透過 API 產生
  title        TEXT NOT NULL,
  date         TIMESTAMPTZ,  -- 會議日期時間（支持前端 datetime-local）
  description  TEXT,
  summary      TEXT,
  expires_at   TIMESTAMPTZ,
  calendar_event_id TEXT, -- Google Calendar event id
  status       TEXT NOT NULL DEFAULT 'active',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version      INT NOT NULL DEFAULT 1
 );
CREATE INDEX idx_meetings_invite_code ON meetings(invite_code);

-- 會議參與者表
CREATE TABLE meeting_participants (
  id           BIGSERIAL PRIMARY KEY,
  meeting_id   UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         VARCHAR(20) NOT NULL DEFAULT 'participant',  -- 'host' 或 'participant'
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(meeting_id, user_id)
);

CREATE INDEX idx_participants_meeting ON meeting_participants(meeting_id);
CREATE INDEX idx_participants_user ON meeting_participants(user_id);


CREATE TABLE agenda_items (
  id          BIGSERIAL PRIMARY KEY,
  meeting_id  UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  order_index INT NOT NULL,      -- 對應你前端的 idx
  time        VARCHAR(10),       -- "09:00"
  title       TEXT NOT NULL,
  owner       TEXT,
  note        TEXT
);

CREATE INDEX idx_agenda_meeting ON agenda_items(meeting_id);
