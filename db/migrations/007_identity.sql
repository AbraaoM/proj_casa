-- Identity for a public deploy: who did what, and no account left on the initial password.

ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_is_default boolean NOT NULL DEFAULT false;

-- Databases created before this change seeded an account with the password "admin".
-- It must be changed before anything else, and it cannot sign in on a production deploy.
UPDATE users
SET must_change_password = true, password_is_default = true
WHERE password_hash = crypt('admin', password_hash);

-- Every key belongs to a person. Keys without an owner go to the first master account,
-- so the agent that already uses one keeps working.
UPDATE agent_keys
SET created_by = (SELECT id FROM users ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, created_at LIMIT 1)
WHERE created_by IS NULL;

-- Who wrote each record: the person and the agent key (null when written from the panel).
ALTER TABLE care_items ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE care_items ADD COLUMN IF NOT EXISTS agent_key_id uuid REFERENCES agent_keys (id) ON DELETE SET NULL;
ALTER TABLE care_events ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE care_events ADD COLUMN IF NOT EXISTS agent_key_id uuid REFERENCES agent_keys (id) ON DELETE SET NULL;
ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE fin_transactions ADD COLUMN IF NOT EXISTS agent_key_id uuid REFERENCES agent_keys (id) ON DELETE SET NULL;
ALTER TABLE fin_bills ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE fin_bills ADD COLUMN IF NOT EXISTS agent_key_id uuid REFERENCES agent_keys (id) ON DELETE SET NULL;

-- One row per agent write (POST, PATCH, PUT), from REST or MCP.
CREATE TABLE IF NOT EXISTS agent_activity (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  agent_key_id uuid REFERENCES agent_keys (id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('rest', 'mcp', 'telegram')),
  action text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 200),
  status int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_activity_created_at_idx ON agent_activity (created_at DESC);

INSERT INTO schema_migrations (version)
VALUES ('007_identity')
ON CONFLICT (version) DO NOTHING;
