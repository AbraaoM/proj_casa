-- 004: per-subject history and house areas.
-- The runner applies statements one by one without a transaction, so every
-- statement here must be safe to run again.

CREATE TABLE IF NOT EXISTS house_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9_]{1,40}$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  kind text NOT NULL DEFAULT 'room' CHECK (kind IN ('room', 'outdoor', 'system')),
  sort_order integer NOT NULL DEFAULT 0,
  notes text,
  archived_at timestamptz,
  created_by_agent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS house_areas_set_updated_at ON house_areas;
CREATE TRIGGER house_areas_set_updated_at
BEFORE UPDATE ON house_areas
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Pending items: a house item may point to an area.
ALTER TABLE care_items ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES house_areas (id);

ALTER TABLE care_items DROP CONSTRAINT IF EXISTS care_items_subject_matches_domain;
ALTER TABLE care_items ADD CONSTRAINT care_items_subject_matches_domain CHECK (
  (domain = 'dog' AND dog_id IS NOT NULL AND family_member_id IS NULL AND vehicle_id IS NULL AND area_id IS NULL)
  OR (domain = 'family' AND family_member_id IS NOT NULL AND dog_id IS NULL AND vehicle_id IS NULL AND area_id IS NULL)
  OR (domain = 'car' AND vehicle_id IS NOT NULL AND dog_id IS NULL AND family_member_id IS NULL AND area_id IS NULL)
  OR (domain = 'house' AND dog_id IS NULL AND family_member_id IS NULL AND vehicle_id IS NULL)
  OR (domain = 'finance' AND dog_id IS NULL AND family_member_id IS NULL AND vehicle_id IS NULL AND area_id IS NULL)
);

CREATE INDEX IF NOT EXISTS care_items_area_id_idx ON care_items (area_id);

-- History: an event no longer needs a pending item and carries its own subject.
ALTER TABLE care_events ALTER COLUMN care_item_id DROP NOT NULL;
ALTER TABLE care_events ADD COLUMN IF NOT EXISTS domain text;
ALTER TABLE care_events ADD COLUMN IF NOT EXISTS dog_id uuid REFERENCES dogs (id);
ALTER TABLE care_events ADD COLUMN IF NOT EXISTS family_member_id uuid REFERENCES family_members (id);
ALTER TABLE care_events ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES vehicles (id);
ALTER TABLE care_events ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES house_areas (id);
ALTER TABLE care_events ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE care_events ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE care_events ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE care_events ADD COLUMN IF NOT EXISTS voided_at timestamptz;
ALTER TABLE care_events ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE care_events e SET
  domain = i.domain,
  dog_id = i.dog_id,
  family_member_id = i.family_member_id,
  vehicle_id = i.vehicle_id,
  area_id = i.area_id,
  category = i.category,
  title = i.title
FROM care_items i
WHERE e.care_item_id = i.id
  AND e.domain IS NULL;

ALTER TABLE care_events ALTER COLUMN domain SET NOT NULL;
ALTER TABLE care_events ALTER COLUMN category SET NOT NULL;
ALTER TABLE care_events ALTER COLUMN title SET NOT NULL;

ALTER TABLE care_events DROP CONSTRAINT IF EXISTS care_events_domain_check;
ALTER TABLE care_events ADD CONSTRAINT care_events_domain_check
  CHECK (domain IN ('dog', 'house', 'finance', 'car', 'family'));

ALTER TABLE care_events DROP CONSTRAINT IF EXISTS care_events_category_check;
ALTER TABLE care_events ADD CONSTRAINT care_events_category_check
  CHECK (category ~ '^[a-z0-9_]{1,40}$');

ALTER TABLE care_events DROP CONSTRAINT IF EXISTS care_events_title_check;
ALTER TABLE care_events ADD CONSTRAINT care_events_title_check
  CHECK (char_length(btrim(title)) > 0);

ALTER TABLE care_events DROP CONSTRAINT IF EXISTS care_events_subject_matches_domain;
ALTER TABLE care_events ADD CONSTRAINT care_events_subject_matches_domain CHECK (
  (domain = 'dog' AND dog_id IS NOT NULL AND family_member_id IS NULL AND vehicle_id IS NULL AND area_id IS NULL)
  OR (domain = 'family' AND family_member_id IS NOT NULL AND dog_id IS NULL AND vehicle_id IS NULL AND area_id IS NULL)
  OR (domain = 'car' AND vehicle_id IS NOT NULL AND dog_id IS NULL AND family_member_id IS NULL AND area_id IS NULL)
  OR (domain = 'house' AND dog_id IS NULL AND family_member_id IS NULL AND vehicle_id IS NULL)
  OR (domain = 'finance' AND dog_id IS NULL AND family_member_id IS NULL AND vehicle_id IS NULL AND area_id IS NULL)
);

CREATE INDEX IF NOT EXISTS care_events_dog_done_idx ON care_events (dog_id, done_on DESC);
CREATE INDEX IF NOT EXISTS care_events_vehicle_done_idx ON care_events (vehicle_id, done_on DESC);
CREATE INDEX IF NOT EXISTS care_events_family_done_idx ON care_events (family_member_id, done_on DESC);
CREATE INDEX IF NOT EXISTS care_events_area_done_idx ON care_events (area_id, done_on DESC);
CREATE INDEX IF NOT EXISTS care_events_domain_category_done_idx ON care_events (domain, category, done_on DESC);

DROP TRIGGER IF EXISTS care_events_set_updated_at ON care_events;
CREATE TRIGGER care_events_set_updated_at
BEFORE UPDATE ON care_events
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO schema_migrations (version)
VALUES ('004_history_areas')
ON CONFLICT (version) DO NOTHING;
