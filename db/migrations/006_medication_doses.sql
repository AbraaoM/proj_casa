-- 006: medication doses with a time of day.
-- A dose is a care_event tied to its item, with done_at. The item keeps the
-- hourly schedule (interval_hours, last_done_at, next_due_at) and an optional
-- end of treatment (ends_on). due_date stays the day of next_due_at, so code
-- that only knows days keeps working.
-- The runner applies statements one by one without a transaction, so every
-- statement here must be safe to run again.

ALTER TABLE care_items ADD COLUMN IF NOT EXISTS interval_hours integer
  CHECK (interval_hours IS NULL OR interval_hours BETWEEN 1 AND 168);
ALTER TABLE care_items ADD COLUMN IF NOT EXISTS last_done_at timestamptz;
ALTER TABLE care_items ADD COLUMN IF NOT EXISTS next_due_at timestamptz;
ALTER TABLE care_items ADD COLUMN IF NOT EXISTS ends_on date;

ALTER TABLE care_items DROP CONSTRAINT IF EXISTS care_items_single_interval;
ALTER TABLE care_items ADD CONSTRAINT care_items_single_interval CHECK (
  (interval_days IS NOT NULL)::int + (interval_months IS NOT NULL)::int + (interval_hours IS NOT NULL)::int <= 1
);

ALTER TABLE care_events ADD COLUMN IF NOT EXISTS done_at timestamptz;

CREATE INDEX IF NOT EXISTS care_events_item_done_at_idx
  ON care_events (care_item_id, done_at DESC)
  WHERE done_at IS NOT NULL AND voided_at IS NULL;

CREATE INDEX IF NOT EXISTS care_items_next_due_at_idx
  ON care_items (next_due_at)
  WHERE next_due_at IS NOT NULL;

INSERT INTO schema_migrations (version)
VALUES ('006_medication_doses')
ON CONFLICT (version) DO NOTHING;
