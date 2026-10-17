CREATE TABLE IF NOT EXISTS agent_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 64),
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_keys_active_hash_idx
  ON agent_keys (key_hash)
  WHERE revoked_at IS NULL;

INSERT INTO schema_migrations (version)
VALUES ('003_agent_keys')
ON CONFLICT (version) DO NOTHING;
