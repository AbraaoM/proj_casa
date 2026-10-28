-- Google Agenda: one connection per person. The refresh token is AES-256-GCM ciphertext (CASA_SECRET_KEY).

CREATE TABLE IF NOT EXISTS google_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  google_email text CHECK (google_email IS NULL OR char_length(google_email) <= 320),
  refresh_token_enc text NOT NULL,
  calendar_id text NOT NULL DEFAULT 'primary' CHECK (char_length(calendar_id) BETWEEN 1 AND 200),
  connected_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS google_connections_active_user
  ON google_connections (user_id) WHERE revoked_at IS NULL;

-- Single-use OAuth state and PKCE verifier. Ten minutes.
CREATE TABLE IF NOT EXISTS google_oauth_states (
  state_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  verifier_enc text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotency for events the agent creates, per person.
CREATE TABLE IF NOT EXISTS google_event_keys (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  external_key text NOT NULL CHECK (char_length(external_key) BETWEEN 1 AND 200),
  google_event_id text NOT NULL CHECK (char_length(google_event_id) BETWEEN 1 AND 1024),
  calendar_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, external_key)
);

INSERT INTO schema_migrations (version)
VALUES ('009_google_calendar')
ON CONFLICT (version) DO NOTHING;
