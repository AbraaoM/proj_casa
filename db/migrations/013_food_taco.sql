-- Which TACO row supplied the calories. Null when the number was stated or is still unknown.

ALTER TABLE food_items ADD COLUMN IF NOT EXISTS taco_id integer;
ALTER TABLE food_dish_lines ADD COLUMN IF NOT EXISTS taco_id integer;

INSERT INTO schema_migrations (version)
VALUES ('013_food_taco')
ON CONFLICT (version) DO NOTHING;
