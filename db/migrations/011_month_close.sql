-- A finished month, frozen as the household said it was. Later corrections do not move it
-- unless the close is taken again.

CREATE TABLE IF NOT EXISTS fin_month_closes (
  month date PRIMARY KEY,
  closed_on date NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version)
VALUES ('011_month_close')
ON CONFLICT (version) DO NOTHING;
