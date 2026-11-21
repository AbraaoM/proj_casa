-- Families (tenants), phase 1. Additive and safe to run while the previous release is live:
-- every existing row becomes part of one original family, nothing is dropped or renamed, and the
-- old constraints stay until 015_families_finish. The previous release connects as the table owner
-- (which bypasses row level security) and keeps working without knowing families exist.
--
-- Isolation model: every business table has family_id. The app runs each query in one transaction
-- as the NOLOGIN role casa_app with app.family_id set (lib/db/tenant.ts). Row level security then
-- shows and accepts only that family's rows. With no family set, casa_app sees nothing (fails closed).

CREATE OR REPLACE FUNCTION app_family_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT nullif(current_setting('app.family_id', true), '')::uuid $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'casa_app') THEN
    CREATE ROLE casa_app NOLOGIN NOBYPASSRLS;
  END IF;
  -- The connection role switches to casa_app per transaction (SET LOCAL ROLE).
  EXECUTE format('GRANT casa_app TO %I', current_user);
END
$$;

GRANT USAGE ON SCHEMA public TO casa_app;

CREATE TABLE IF NOT EXISTS families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  -- The family that existed before sign-up opened. Old webhook and agent URLs resolve to it.
  is_original boolean NOT NULL DEFAULT false,
  never_expires boolean NOT NULL DEFAULT false,
  trial_ends_at timestamptz,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS families_one_original ON families (is_original) WHERE is_original;

DROP TRIGGER IF EXISTS families_set_updated_at ON families;
CREATE TRIGGER families_set_updated_at
BEFORE UPDATE ON families
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO families (id, name, is_original, never_expires)
VALUES ('0f5a4e2c-6d1b-4c3a-9a7e-2b8d1c4e5f60', 'Minha família', true, true)
ON CONFLICT (id) DO NOTHING;

-- One family per account. owner = can invite, revoke and reset passwords.
CREATE TABLE IF NOT EXISTS family_accounts (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  family_id uuid NOT NULL REFERENCES families (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'member')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS family_accounts_family_idx ON family_accounts (family_id);

-- Every existing account joins the original family (master accounts become owners).
INSERT INTO family_accounts (user_id, family_id, role)
SELECT id, '0f5a4e2c-6d1b-4c3a-9a7e-2b8d1c4e5f60', CASE WHEN role = 'admin' THEN 'owner' ELSE 'member' END
FROM users
ON CONFLICT (user_id) DO NOTHING;

-- Invitation links: the code is shown once, only its hash is stored. Single use, expires, revocable.
CREATE TABLE IF NOT EXISTS family_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families (id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  accepted_by uuid REFERENCES users (id) ON DELETE SET NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS family_invites_family_idx ON family_invites (family_id, created_at DESC);

-- family_id on every business table. The default keeps the previous release writing into the
-- original family. 015 makes it strict (only the family set for the transaction).
DO $$
DECLARE
  t text;
  original constant uuid := '0f5a4e2c-6d1b-4c3a-9a7e-2b8d1c4e5f60';
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'household_settings', 'dogs', 'family_members', 'vehicles', 'care_items', 'care_events', 'house_areas',
    'fin_accounts', 'fin_categories', 'fin_bills', 'fin_transactions', 'fin_budgets', 'fin_balance_checks',
    'fin_month_closes', 'agent_keys', 'agent_activity', 'bot_config', 'bot_config_log', 'telegram_link_codes',
    'telegram_links', 'telegram_chats', 'agent_messages', 'telegram_updates', 'google_connections',
    'google_oauth_states', 'google_event_keys', 'food_items', 'food_dishes', 'food_dish_lines',
    'food_shopping', 'food_meals'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS family_id uuid NOT NULL DEFAULT coalesce(app_family_id(), %L::uuid) REFERENCES families (id)',
      t, original
    );
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (family_id)', t || '_family_idx', t);
  END LOOP;
END
$$;

-- Row level security: casa_app sees and writes only the rows of app.family_id.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'household_settings', 'dogs', 'family_members', 'vehicles', 'care_items', 'care_events', 'house_areas',
    'fin_accounts', 'fin_categories', 'fin_bills', 'fin_transactions', 'fin_budgets', 'fin_balance_checks',
    'fin_month_closes', 'agent_keys', 'agent_activity', 'bot_config', 'bot_config_log', 'telegram_link_codes',
    'telegram_links', 'telegram_chats', 'agent_messages', 'telegram_updates', 'google_connections',
    'google_oauth_states', 'google_event_keys', 'food_items', 'food_dishes', 'food_dish_lines',
    'food_shopping', 'food_meals', 'family_invites', 'family_accounts'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I AS PERMISSIVE FOR ALL TO casa_app USING (family_id = app_family_id()) WITH CHECK (family_id = app_family_id())',
      t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO casa_app', t);
  END LOOP;
END
$$;

-- The family row itself is read-only for the app, and only its own.
ALTER TABLE families ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON families;
CREATE POLICY tenant_isolation ON families AS PERMISSIVE FOR SELECT TO casa_app USING (id = app_family_id());
GRANT SELECT ON families TO casa_app;

-- Names of people in the same family (who did what). Never passwords, never other families.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON users;
CREATE POLICY tenant_isolation ON users AS PERMISSIVE FOR SELECT TO casa_app
  USING (id IN (SELECT user_id FROM family_accounts));
GRANT SELECT (id, username) ON users TO casa_app;
GRANT SELECT ON schema_migrations TO casa_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO casa_app;

-- Uniqueness becomes per family. The old global constraints stay until 015.
CREATE UNIQUE INDEX IF NOT EXISTS household_settings_family_key ON household_settings (family_id);
CREATE UNIQUE INDEX IF NOT EXISTS bot_config_family_key ON bot_config (family_id);
CREATE UNIQUE INDEX IF NOT EXISTS fin_month_closes_family_month_key ON fin_month_closes (family_id, month);
CREATE UNIQUE INDEX IF NOT EXISTS telegram_chats_family_chat_key ON telegram_chats (family_id, chat_id);
CREATE UNIQUE INDEX IF NOT EXISTS telegram_updates_family_update_key ON telegram_updates (family_id, update_id);
CREATE UNIQUE INDEX IF NOT EXISTS telegram_links_family_tg_active ON telegram_links (family_id, telegram_user_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fin_accounts_family_slug_key ON fin_accounts (family_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS fin_categories_family_slug_key ON fin_categories (family_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS fin_bills_family_slug_key ON fin_bills (family_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS house_areas_family_slug_key ON house_areas (family_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS food_dishes_family_slug_key ON food_dishes (family_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS food_items_family_slug_key ON food_items (family_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS care_items_family_external_key ON care_items (family_id, external_key);
CREATE UNIQUE INDEX IF NOT EXISTS care_events_family_external_key ON care_events (family_id, external_key);
CREATE UNIQUE INDEX IF NOT EXISTS fin_balance_checks_family_external_key ON fin_balance_checks (family_id, external_key);
CREATE UNIQUE INDEX IF NOT EXISTS fin_bills_family_external_key ON fin_bills (family_id, external_key);
CREATE UNIQUE INDEX IF NOT EXISTS fin_transactions_family_external_key ON fin_transactions (family_id, external_key);
CREATE UNIQUE INDEX IF NOT EXISTS food_dishes_family_external_key ON food_dishes (family_id, external_key);
CREATE UNIQUE INDEX IF NOT EXISTS food_items_family_external_key ON food_items (family_id, external_key);
CREATE UNIQUE INDEX IF NOT EXISTS food_meals_family_external_key ON food_meals (family_id, external_key);
CREATE UNIQUE INDEX IF NOT EXISTS food_shopping_family_external_key ON food_shopping (family_id, external_key);

-- Composite foreign keys: a row can only point at a row of its own family, even if the app
-- were handed another family's id. Each parent gets UNIQUE (family_id, id).
DO $$
DECLARE
  parent text;
  edge text;
  child text;
  col text;
BEGIN
  FOREACH parent IN ARRAY ARRAY[
    'house_areas', 'care_items', 'dogs', 'family_members', 'vehicles', 'fin_accounts', 'fin_categories',
    'fin_bills', 'care_events', 'food_dishes', 'food_items'
  ] LOOP
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I (family_id, id)', parent || '_family_id_id_key', parent);
  END LOOP;

  FOREACH edge IN ARRAY ARRAY[
    'care_events.area_id>house_areas', 'care_events.care_item_id>care_items', 'care_events.dog_id>dogs',
    'care_events.family_member_id>family_members', 'care_events.vehicle_id>vehicles',
    'care_items.area_id>house_areas', 'care_items.dog_id>dogs', 'care_items.family_member_id>family_members',
    'care_items.vehicle_id>vehicles', 'fin_balance_checks.account_id>fin_accounts',
    'fin_bills.account_id>fin_accounts', 'fin_bills.care_item_id>care_items', 'fin_bills.category_id>fin_categories',
    'fin_budgets.category_id>fin_categories', 'fin_categories.parent_id>fin_categories',
    'fin_transactions.account_id>fin_accounts', 'fin_transactions.bill_id>fin_bills',
    'fin_transactions.care_event_id>care_events', 'fin_transactions.category_id>fin_categories',
    'fin_transactions.to_account_id>fin_accounts', 'food_dish_lines.dish_id>food_dishes',
    'food_dish_lines.food_item_id>food_items', 'food_meals.dish_id>food_dishes',
    'food_meals.family_member_id>family_members', 'food_shopping.food_item_id>food_items'
  ] LOOP
    child := split_part(split_part(edge, '>', 1), '.', 1);
    col := split_part(split_part(edge, '>', 1), '.', 2);
    parent := split_part(edge, '>', 2);
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = child || '_' || col || '_family_fk' AND conrelid = child::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (family_id, %I) REFERENCES %I (family_id, id)',
        child, child || '_' || col || '_family_fk', col, parent
      );
    END IF;
  END LOOP;
END
$$;

INSERT INTO schema_migrations (version)
VALUES ('014_families')
ON CONFLICT (version) DO NOTHING;
