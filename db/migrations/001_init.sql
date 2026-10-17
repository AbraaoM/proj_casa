CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS household_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  city text NOT NULL,
  region text NOT NULL,
  country text NOT NULL,
  latitude numeric(7, 4) NOT NULL,
  longitude numeric(7, 4) NOT NULL,
  timezone text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) > 0),
  breed text,
  sex text NOT NULL DEFAULT 'unknown' CHECK (sex IN ('male', 'female', 'unknown')),
  birth_date date,
  weight_kg numeric(5, 2),
  notes text,
  archived_at timestamptz,
  created_by_agent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) > 0),
  relationship text,
  birth_date date,
  notes text,
  archived_at timestamptz,
  created_by_agent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) > 0),
  make text,
  model text,
  year integer,
  plate text,
  odometer_km integer,
  notes text,
  archived_at timestamptz,
  created_by_agent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS care_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL CHECK (domain IN ('dog', 'house', 'finance', 'car', 'family')),
  dog_id uuid REFERENCES dogs (id),
  family_member_id uuid REFERENCES family_members (id),
  vehicle_id uuid REFERENCES vehicles (id),
  title text NOT NULL CHECK (char_length(btrim(title)) > 0),
  category text NOT NULL CHECK (category ~ '^[a-z0-9_]{1,40}$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  due_date date,
  last_done_on date,
  interval_days integer CHECK (interval_days IS NULL OR interval_days > 0),
  notes text,
  created_by_agent boolean NOT NULL DEFAULT false,
  external_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT care_items_subject_matches_domain CHECK (
    (
      domain = 'dog'
      AND dog_id IS NOT NULL
      AND family_member_id IS NULL
      AND vehicle_id IS NULL
    )
    OR (
      domain = 'family'
      AND family_member_id IS NOT NULL
      AND dog_id IS NULL
      AND vehicle_id IS NULL
    )
    OR (
      domain = 'car'
      AND vehicle_id IS NOT NULL
      AND dog_id IS NULL
      AND family_member_id IS NULL
    )
    OR (
      domain IN ('house', 'finance')
      AND dog_id IS NULL
      AND family_member_id IS NULL
      AND vehicle_id IS NULL
    )
  )
);

CREATE TABLE IF NOT EXISTS care_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  care_item_id uuid NOT NULL REFERENCES care_items (id),
  done_on date NOT NULL,
  notes text,
  weight_kg numeric(5, 2),
  odometer_km integer,
  amount_cents integer,
  created_by_agent boolean NOT NULL DEFAULT false,
  external_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS care_items_external_key_key ON care_items (external_key);
CREATE UNIQUE INDEX IF NOT EXISTS care_events_external_key_key ON care_events (external_key);
CREATE INDEX IF NOT EXISTS care_items_status_due_date_idx ON care_items (status, due_date);
CREATE INDEX IF NOT EXISTS care_items_domain_status_idx ON care_items (domain, status);
CREATE INDEX IF NOT EXISTS care_items_dog_id_idx ON care_items (dog_id);
CREATE INDEX IF NOT EXISTS care_items_family_member_id_idx ON care_items (family_member_id);
CREATE INDEX IF NOT EXISTS care_items_vehicle_id_idx ON care_items (vehicle_id);
CREATE INDEX IF NOT EXISTS care_events_item_done_idx ON care_events (care_item_id, done_on DESC);

DROP TRIGGER IF EXISTS household_settings_set_updated_at ON household_settings;
CREATE TRIGGER household_settings_set_updated_at
BEFORE UPDATE ON household_settings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS dogs_set_updated_at ON dogs;
CREATE TRIGGER dogs_set_updated_at
BEFORE UPDATE ON dogs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS family_members_set_updated_at ON family_members;
CREATE TRIGGER family_members_set_updated_at
BEFORE UPDATE ON family_members
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS vehicles_set_updated_at ON vehicles;
CREATE TRIGGER vehicles_set_updated_at
BEFORE UPDATE ON vehicles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS care_items_set_updated_at ON care_items;
CREATE TRIGGER care_items_set_updated_at
BEFORE UPDATE ON care_items
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO household_settings (id, city, region, country, latitude, longitude, timezone)
VALUES (1, 'Pindamonhangaba', 'SP', 'BR', -22.9239, -45.4617, 'America/Sao_Paulo')
ON CONFLICT (id) DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('001_init')
ON CONFLICT (version) DO NOTHING;
