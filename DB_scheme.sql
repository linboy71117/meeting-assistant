CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE meetings (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),  -- 內部用
  invite_code  VARCHAR(32) NOT NULL UNIQUE,                  -- 對外會議代碼：abc-defg-hij
  title        TEXT NOT NULL,
  date         DATE,                                         -- 你目前是字串，也可以先用 DATE
  description  TEXT,                                         -- 想想要不要留
  meet_url     TEXT,
  summary      TEXT,                                         -- 想想要不要留        
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version      INT NOT NULL DEFAULT 1                        -- 鎖用（防止覆蓋別人的修改）
);

CREATE INDEX idx_meetings_invite_code ON meetings(invite_code);


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
