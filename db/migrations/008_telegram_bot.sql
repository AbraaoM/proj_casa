-- Telegram bot: settings (secrets encrypted with CASA_SECRET_KEY), links, chats, short memory.

-- One row. Secrets are AES-256-GCM ciphertext. The _last4 columns are what the screen shows.
CREATE TABLE IF NOT EXISTS bot_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  ai_provider text NOT NULL DEFAULT 'groq'
    CHECK (ai_provider IN ('groq', 'openai', 'anthropic', 'google', 'openrouter', 'openai-compatible')),
  ai_model text NOT NULL DEFAULT 'openai/gpt-oss-120b' CHECK (char_length(ai_model) BETWEEN 1 AND 120),
  ai_base_url text CHECK (ai_base_url IS NULL OR char_length(ai_base_url) <= 300),
  ai_api_key_enc text,
  ai_api_key_last4 text,
  telegram_token_enc text,
  telegram_token_last4 text,
  webhook_secret_enc text,
  webhook_secret_last4 text,
  bot_username text,
  webhook_url text,
  webhook_registered_at timestamptz,
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO bot_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Who changed the bot settings and what (field names only, never values).
CREATE TABLE IF NOT EXISTS bot_config_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  action text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 60),
  fields text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Keys now have a kind: an API key handed to an agent, or the internal key of the Telegram bot
-- for one person (its label is the name the person gave the bot, and its secret is never shown).
ALTER TABLE agent_keys ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'api' CHECK (kind IN ('api', 'telegram'));
CREATE UNIQUE INDEX IF NOT EXISTS agent_keys_one_telegram_per_user
  ON agent_keys (created_by) WHERE kind = 'telegram' AND revoked_at IS NULL;

-- Single-use code behind the "Conectar Telegram" button (t.me/<bot>?start=<code>).
CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A Telegram account linked to a Casa account.
CREATE TABLE IF NOT EXISTS telegram_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  telegram_user_id bigint NOT NULL,
  private_chat_id bigint,
  telegram_name text,
  linked_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS telegram_links_active_tg ON telegram_links (telegram_user_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS telegram_links_active_user ON telegram_links (user_id) WHERE revoked_at IS NULL;

-- Chats the bot is in (private or the family group), for the daily summary.
CREATE TABLE IF NOT EXISTS telegram_chats (
  chat_id bigint PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('private', 'group', 'supergroup')),
  title text,
  active boolean NOT NULL DEFAULT true,
  digest boolean NOT NULL DEFAULT true,
  last_digest_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Short memory per chat (the bot reads the last few). Deleted after 30 days.
CREATE TABLE IF NOT EXISTS agent_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chat_id bigint NOT NULL,
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  author text,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_messages_chat_idx ON agent_messages (chat_id, id DESC);

-- Telegram may deliver an update twice. The first one wins.
CREATE TABLE IF NOT EXISTS telegram_updates (
  update_id bigint PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version)
VALUES ('008_telegram_bot')
ON CONFLICT (version) DO NOTHING;
