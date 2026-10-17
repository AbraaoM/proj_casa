-- 005: finances. Single-entry, BRL, integer cents.
-- The runner applies statements one by one without a transaction, so every
-- statement here must be safe to run again.

-- Monthly schedules for any pending item (e.g. "every 3 months").
ALTER TABLE care_items ADD COLUMN IF NOT EXISTS interval_months integer
  CHECK (interval_months IS NULL OR interval_months BETWEEN 1 AND 120);
ALTER TABLE care_items DROP CONSTRAINT IF EXISTS care_items_single_interval;
ALTER TABLE care_items ADD CONSTRAINT care_items_single_interval
  CHECK (interval_days IS NULL OR interval_months IS NULL);

CREATE TABLE IF NOT EXISTS fin_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9_]{1,40}$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  kind text NOT NULL CHECK (kind IN ('checking', 'savings', 'cash', 'credit_card', 'investment', 'loan', 'other')),
  opening_balance_cents bigint NOT NULL DEFAULT 0,
  opening_date date,
  credit_limit_cents bigint CHECK (credit_limit_cents IS NULL OR credit_limit_cents >= 0),
  statement_close_day integer CHECK (statement_close_day IS NULL OR statement_close_day BETWEEN 1 AND 31),
  due_day integer CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 31),
  sort_order integer NOT NULL DEFAULT 0,
  notes text,
  archived_at timestamptz,
  created_by_agent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fin_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9_]{1,40}$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  kind text NOT NULL CHECK (kind IN ('expense', 'income')),
  parent_id uuid REFERENCES fin_categories (id),
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_by_agent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE IF NOT EXISTS fin_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9_]{1,40}$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  kind text NOT NULL CHECK (kind IN ('bill', 'subscription', 'installment', 'income')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  amount_varies boolean NOT NULL DEFAULT false,
  category_id uuid NOT NULL REFERENCES fin_categories (id),
  account_id uuid REFERENCES fin_accounts (id),
  frequency text NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('monthly', 'yearly', 'weekly', 'every_n_days')),
  interval integer NOT NULL DEFAULT 1 CHECK (interval BETWEEN 1 AND 366),
  day_of_month integer CHECK (day_of_month IS NULL OR day_of_month BETWEEN 1 AND 31),
  next_due_date date NOT NULL,
  end_date date,
  remaining integer CHECK (remaining IS NULL OR remaining >= 0),
  autopay boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('suggested', 'active', 'paused', 'ended')),
  care_item_id uuid UNIQUE REFERENCES care_items (id),
  notes text,
  external_key text UNIQUE,
  created_by_agent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fin_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('expense', 'income', 'transfer')),
  date date NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  account_id uuid REFERENCES fin_accounts (id),
  to_account_id uuid REFERENCES fin_accounts (id),
  category_id uuid REFERENCES fin_categories (id),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 160),
  payee text,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'cleared')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'care_event', 'bill')),
  care_event_id uuid UNIQUE REFERENCES care_events (id),
  bill_id uuid REFERENCES fin_bills (id),
  installment_group uuid,
  installment_n integer,
  installment_total integer,
  external_key text UNIQUE,
  voided_at timestamptz,
  created_by_agent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fin_transactions_shape CHECK (
    (kind = 'transfer' AND account_id IS NOT NULL AND to_account_id IS NOT NULL
      AND to_account_id <> account_id AND category_id IS NULL)
    OR (kind IN ('expense', 'income') AND category_id IS NOT NULL AND to_account_id IS NULL)
  ),
  CONSTRAINT fin_transactions_installment CHECK (
    (installment_group IS NULL AND installment_n IS NULL AND installment_total IS NULL)
    OR (installment_group IS NOT NULL AND installment_total BETWEEN 2 AND 120
      AND installment_n BETWEEN 1 AND installment_total)
  )
);

CREATE INDEX IF NOT EXISTS fin_transactions_date_idx ON fin_transactions (date);
CREATE INDEX IF NOT EXISTS fin_transactions_account_date_idx ON fin_transactions (account_id, date);
CREATE INDEX IF NOT EXISTS fin_transactions_to_account_date_idx ON fin_transactions (to_account_id, date);
CREATE INDEX IF NOT EXISTS fin_transactions_category_date_idx ON fin_transactions (category_id, date);
CREATE INDEX IF NOT EXISTS fin_transactions_bill_idx ON fin_transactions (bill_id);
CREATE INDEX IF NOT EXISTS fin_transactions_installment_idx ON fin_transactions (installment_group);

CREATE TABLE IF NOT EXISTS fin_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES fin_categories (id),
  -- First day of the month, or NULL for the category's default monthly budget.
  month date CHECK (month IS NULL OR extract(day FROM month) = 1),
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fin_budgets_category_month_key
  ON fin_budgets (category_id, COALESCE(month, DATE '0001-01-01'));

CREATE TABLE IF NOT EXISTS fin_balance_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES fin_accounts (id),
  date date NOT NULL,
  balance_cents bigint NOT NULL,
  external_key text UNIQUE,
  created_by_agent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fin_balance_checks_account_date_idx ON fin_balance_checks (account_id, date DESC);

DROP TRIGGER IF EXISTS fin_accounts_set_updated_at ON fin_accounts;
CREATE TRIGGER fin_accounts_set_updated_at BEFORE UPDATE ON fin_accounts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS fin_categories_set_updated_at ON fin_categories;
CREATE TRIGGER fin_categories_set_updated_at BEFORE UPDATE ON fin_categories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS fin_bills_set_updated_at ON fin_bills;
CREATE TRIGGER fin_bills_set_updated_at BEFORE UPDATE ON fin_bills
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS fin_transactions_set_updated_at ON fin_transactions;
CREATE TRIGGER fin_transactions_set_updated_at BEFORE UPDATE ON fin_transactions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS fin_budgets_set_updated_at ON fin_budgets;
CREATE TRIGGER fin_budgets_set_updated_at BEFORE UPDATE ON fin_budgets
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Default categories. Keep in sync with lib/domain/finance/categories.ts.
INSERT INTO fin_categories (slug, name, kind, sort_order) VALUES
  ('moradia', 'Moradia', 'expense', 10),
  ('alimentacao', 'Alimentação', 'expense', 20),
  ('transporte', 'Transporte', 'expense', 30),
  ('pets', 'Pets', 'expense', 40),
  ('saude', 'Saúde', 'expense', 50),
  ('casa', 'Casa', 'expense', 60),
  ('educacao', 'Educação', 'expense', 70),
  ('lazer', 'Lazer', 'expense', 80),
  ('assinaturas', 'Assinaturas', 'expense', 90),
  ('impostos_taxas', 'Impostos e taxas', 'expense', 100),
  ('outros', 'Outros', 'expense', 110),
  ('salario', 'Salário', 'income', 10),
  ('renda_extra', 'Renda extra', 'income', 20),
  ('reembolso', 'Reembolso', 'income', 30),
  ('outras_receitas', 'Outras receitas', 'income', 40)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO fin_categories (slug, name, kind, parent_id, sort_order)
SELECT child.slug, child.name, 'expense', parent.id, child.sort_order
FROM (VALUES
  ('aluguel', 'Aluguel ou financiamento', 'moradia', 1),
  ('condominio', 'Condomínio', 'moradia', 2),
  ('energia', 'Energia', 'moradia', 3),
  ('agua', 'Água', 'moradia', 4),
  ('gas', 'Gás', 'moradia', 5),
  ('internet', 'Internet e telefone', 'moradia', 6),
  ('mercado', 'Mercado', 'alimentacao', 1),
  ('restaurante', 'Restaurante e delivery', 'alimentacao', 2),
  ('combustivel', 'Combustível', 'transporte', 1),
  ('carro_manutencao', 'Manutenção do carro', 'transporte', 2),
  ('carro_impostos_seguro', 'IPVA, licenciamento e seguro', 'transporte', 3),
  ('transporte_app', 'Aplicativo e ônibus', 'transporte', 4),
  ('pets_racao', 'Ração', 'pets', 1),
  ('pets_saude', 'Saúde dos pets', 'pets', 2),
  ('pets_banho', 'Banho e tosa', 'pets', 3),
  ('saude_consulta', 'Consultas e exames', 'saude', 1),
  ('saude_farmacia', 'Farmácia', 'saude', 2),
  ('saude_plano', 'Plano de saúde', 'saude', 3),
  ('casa_manutencao', 'Manutenção da casa', 'casa', 1),
  ('casa_limpeza', 'Limpeza', 'casa', 2)
) AS child (slug, name, parent_slug, sort_order)
JOIN fin_categories parent ON parent.slug = child.parent_slug
ON CONFLICT (slug) DO NOTHING;

-- Backfill: every live event with a cost becomes one expense.
-- The mapping mirrors lib/domain/finance/sector-map.ts (a test checks both agree).
INSERT INTO fin_transactions (kind, date, amount_cents, category_id, description, source, care_event_id, created_by_agent)
SELECT 'expense', e.done_on, e.amount_cents, c.id, e.title, 'care_event', e.id, true
FROM care_events e
JOIN fin_categories c ON c.slug = CASE
  WHEN e.domain = 'dog' AND e.category IN ('vaccine', 'vet', 'deworming', 'flea') THEN 'pets_saude'
  WHEN e.domain = 'dog' AND e.category = 'grooming' THEN 'pets_banho'
  WHEN e.domain = 'dog' THEN 'pets'
  WHEN e.domain = 'car' AND e.category IN ('oil', 'service', 'tire', 'inspection') THEN 'carro_manutencao'
  WHEN e.domain = 'car' AND e.category = 'fuel' THEN 'combustivel'
  WHEN e.domain = 'car' THEN 'transporte'
  WHEN e.domain = 'house' AND e.category IN ('cleaning', 'deep_clean') THEN 'casa_limpeza'
  WHEN e.domain = 'house' THEN 'casa_manutencao'
  WHEN e.domain = 'family' AND e.category = 'medicine' THEN 'saude_farmacia'
  WHEN e.domain = 'family' THEN 'saude_consulta'
  WHEN e.domain = 'finance' AND e.category = 'gas' THEN 'gas'
  WHEN e.domain = 'finance' AND e.category = 'dog_food' THEN 'pets_racao'
  ELSE 'outros'
END
WHERE e.amount_cents IS NOT NULL
  AND e.amount_cents > 0
  AND e.voided_at IS NULL
ON CONFLICT (care_event_id) DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('005_finance')
ON CONFLICT (version) DO NOTHING;
