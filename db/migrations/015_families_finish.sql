-- Families, phase 2. Run after the release that knows about families is live: the old global
-- constraints go away (a second family needs its own slugs, external keys and settings row)
-- and family_id loses its fallback, so a write with no family set fails instead of landing
-- in the original family. The release before 014/015 cannot write after this: roll back to a
-- release that has families, never to an older one.

-- Accounts created between 014 and the new release (by the old code) join the original family.
INSERT INTO family_accounts (user_id, family_id, role)
SELECT id, '0f5a4e2c-6d1b-4c3a-9a7e-2b8d1c4e5f60', CASE WHEN role = 'admin' THEN 'owner' ELSE 'member' END
FROM users
ON CONFLICT (user_id) DO NOTHING;

-- Global uniqueness -> per family (the per-family indexes were created in 014).
ALTER TABLE fin_accounts DROP CONSTRAINT IF EXISTS fin_accounts_slug_key;
ALTER TABLE fin_categories DROP CONSTRAINT IF EXISTS fin_categories_slug_key;
ALTER TABLE fin_bills DROP CONSTRAINT IF EXISTS fin_bills_slug_key;
ALTER TABLE house_areas DROP CONSTRAINT IF EXISTS house_areas_slug_key;
ALTER TABLE food_dishes DROP CONSTRAINT IF EXISTS food_dishes_slug_key;
ALTER TABLE food_items DROP CONSTRAINT IF EXISTS food_items_slug_key;
ALTER TABLE fin_balance_checks DROP CONSTRAINT IF EXISTS fin_balance_checks_external_key_key;
ALTER TABLE fin_bills DROP CONSTRAINT IF EXISTS fin_bills_external_key_key;
ALTER TABLE fin_transactions DROP CONSTRAINT IF EXISTS fin_transactions_external_key_key;
ALTER TABLE food_dishes DROP CONSTRAINT IF EXISTS food_dishes_external_key_key;
ALTER TABLE food_items DROP CONSTRAINT IF EXISTS food_items_external_key_key;
ALTER TABLE food_shopping DROP CONSTRAINT IF EXISTS food_shopping_external_key_key;
DROP INDEX IF EXISTS care_items_external_key_key;
DROP INDEX IF EXISTS care_events_external_key_key;
DROP INDEX IF EXISTS food_meals_external_key_key;
DROP INDEX IF EXISTS telegram_links_active_tg;

-- Singletons and Telegram ids become per family.
ALTER TABLE household_settings DROP CONSTRAINT IF EXISTS household_settings_pkey;
ALTER TABLE household_settings DROP CONSTRAINT IF EXISTS household_settings_id_check;
ALTER TABLE household_settings ADD PRIMARY KEY USING INDEX household_settings_family_key;
ALTER TABLE household_settings ALTER COLUMN id DROP NOT NULL;
ALTER TABLE bot_config DROP CONSTRAINT IF EXISTS bot_config_pkey;
ALTER TABLE bot_config DROP CONSTRAINT IF EXISTS bot_config_id_check;
ALTER TABLE bot_config ADD PRIMARY KEY USING INDEX bot_config_family_key;
ALTER TABLE fin_month_closes DROP CONSTRAINT IF EXISTS fin_month_closes_pkey;
ALTER TABLE fin_month_closes ADD PRIMARY KEY USING INDEX fin_month_closes_family_month_key;
ALTER TABLE telegram_chats DROP CONSTRAINT IF EXISTS telegram_chats_pkey;
ALTER TABLE telegram_chats ADD PRIMARY KEY USING INDEX telegram_chats_family_chat_key;
ALTER TABLE telegram_updates DROP CONSTRAINT IF EXISTS telegram_updates_pkey;
ALTER TABLE telegram_updates ADD PRIMARY KEY USING INDEX telegram_updates_family_update_key;

-- No fallback: a write outside a family transaction fails.
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
    'food_shopping', 'food_meals'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN family_id SET DEFAULT app_family_id()', t);
  END LOOP;
END
$$;

INSERT INTO schema_migrations (version)
VALUES ('015_families_finish')
ON CONFLICT (version) DO NOTHING;
