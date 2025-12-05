CREATE TABLE IF NOT EXISTS meetings (
  id           TEXT PRIMARY KEY, --內部ID
  invite_code  TEXT NOT NULL UNIQUE, --會議代碼
  title        TEXT NOT NULL,
  date         TEXT,
  description  TEXT,
  meet_url     TEXT,
  summary      TEXT,             -- 想想要不要留       
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);


CREATE TABLE IF NOT EXISTS agenda_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id  TEXT NOT NULL,
  order_index INTEGER NOT NULL,     -- 對應前端的 idx
  time        TEXT,
  title       TEXT NOT NULL,
  owner       TEXT,
  note        TEXT,
  FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
);
