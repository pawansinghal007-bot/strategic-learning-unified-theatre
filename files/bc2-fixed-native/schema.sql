-- ================================================
-- Browser Capture v2 -- SQLite Schema
-- ================================================

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- -- Local user accounts (hashed with Argon2id in host.py) --
CREATE TABLE IF NOT EXISTS app_users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  username       TEXT    NOT NULL UNIQUE,
  password_hash  TEXT    NOT NULL,
  role           TEXT    NOT NULL DEFAULT 'admin',
  created_at     TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at  TEXT
);

-- -- Browser sessions (one per tab/window open period) --
CREATE TABLE IF NOT EXISTS browser_sessions (
  id           TEXT    PRIMARY KEY,
  browser      TEXT    NOT NULL,
  started_at   TEXT    NOT NULL,
  ended_at     TEXT,
  machine_name TEXT,
  user_id      INTEGER,
  FOREIGN KEY (user_id) REFERENCES app_users(id)
);

-- -- Generic page + interaction events --
CREATE TABLE IF NOT EXISTS page_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT    NOT NULL,
  ts            TEXT    NOT NULL,
  site          TEXT,
  url           TEXT,
  title         TEXT,
  event_type    TEXT    NOT NULL,
  selector      TEXT,
  text_value    TEXT,
  metadata_json TEXT,
  FOREIGN KEY (session_id) REFERENCES browser_sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_page_events_session_ts ON page_events(session_id, ts);
CREATE INDEX IF NOT EXISTS idx_page_events_site_ts    ON page_events(site, ts);
CREATE INDEX IF NOT EXISTS idx_page_events_type       ON page_events(event_type);

-- -- AI chat sessions --
CREATE TABLE IF NOT EXISTS chat_sessions (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL,
  site             TEXT NOT NULL,
  url              TEXT,
  conversation_key TEXT,
  model_name       TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES browser_sessions(id)
);

-- -- AI chat messages (user prompts + assistant replies) --
CREATE TABLE IF NOT EXISTS chat_messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_session_id TEXT    NOT NULL,
  message_key     TEXT,
  role            TEXT    NOT NULL CHECK(role IN ('user','assistant','system')),
  text_content    TEXT    NOT NULL,
  html_content    TEXT,
  stream_state    TEXT    NOT NULL DEFAULT 'final',   -- 'streaming' | 'final'
  ts              TEXT    NOT NULL,
  metadata_json   TEXT,
  FOREIGN KEY (chat_session_id) REFERENCES chat_sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_ts ON chat_messages(chat_session_id, ts);
CREATE INDEX IF NOT EXISTS idx_chat_messages_role       ON chat_messages(role);

-- -- Site adapter config (updatable without redeploying extension) --
CREATE TABLE IF NOT EXISTS site_adapters (
  site           TEXT PRIMARY KEY,
  adapter_name   TEXT NOT NULL,
  enabled        INTEGER NOT NULL DEFAULT 1,
  selectors_json TEXT NOT NULL,
  updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -- Login audit trail --
CREATE TABLE IF NOT EXISTS login_audit (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT    NOT NULL,
  success  INTEGER NOT NULL,
  ts       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source   TEXT
);

-- -- FTS index over page events and chat messages --
CREATE VIRTUAL TABLE IF NOT EXISTS page_events_fts
  USING fts5(text_value, url, title, content='page_events', content_rowid='id');

CREATE VIRTUAL TABLE IF NOT EXISTS chat_messages_fts
  USING fts5(text_content, content='chat_messages', content_rowid='id');

-- -- Seed default site adapters --
INSERT OR IGNORE INTO site_adapters (site, adapter_name, selectors_json, updated_at) VALUES
  ('chat.openai.com',  'openai',     '{"promptInput":"#prompt-textarea","msgContainer":".flex.flex-col.items-center","userMsg":"[data-message-author-role=user]","assistantMsg":"[data-message-author-role=assistant]","sendBtn":"button[data-testid=send-button]"}',        CURRENT_TIMESTAMP),
  ('claude.ai',        'claude',     '{"promptInput":"div[contenteditable=true]","msgContainer":".flex-1.overflow-y-auto","userMsg":"[data-testid=user-message]","assistantMsg":"[data-testid=ai-response]","sendBtn":"button[aria-label=Send]"}',                         CURRENT_TIMESTAMP),
  ('gemini.google.com','gemini',     '{"promptInput":"rich-textarea","msgContainer":"conversation-container","userMsg":".user-query-text","assistantMsg":".model-response-text","sendBtn":"button.send-button"}',                                                          CURRENT_TIMESTAMP),
  ('www.perplexity.ai','perplexity', '{"promptInput":"textarea[placeholder]","msgContainer":".mx-auto","userMsg":".font-medium.break-words","assistantMsg":".prose","sendBtn":"button[aria-label=Submit]"}',                                                              CURRENT_TIMESTAMP);
