-- Evening "who did what" report. Separate from the morning digest so both can go out the same day.

ALTER TABLE telegram_chats ADD COLUMN IF NOT EXISTS last_report_on date;

-- The day page reads every live event of one date.
CREATE INDEX IF NOT EXISTS care_events_done_on_live_idx ON care_events (done_on DESC) WHERE voided_at IS NULL;

INSERT INTO schema_migrations (version)
VALUES ('010_day_report')
ON CONFLICT (version) DO NOTHING;
