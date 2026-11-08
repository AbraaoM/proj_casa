-- Pantry, dishes, the shopping list and what was eaten.
-- Quantities are milli-units (1.5 = 1500). Calories are stored, never inferred later.

CREATE TABLE IF NOT EXISTS food_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) > 0),
  slug text NOT NULL UNIQUE,
  unit text NOT NULL CHECK (unit IN ('g', 'ml', 'un')),
  quantity_milli integer NOT NULL CHECK (quantity_milli >= 0),
  min_quantity_milli integer CHECK (min_quantity_milli IS NULL OR min_quantity_milli >= 0),
  expires_on date,
  kcal_per_100 integer CHECK (kcal_per_100 IS NULL OR kcal_per_100 >= 0),
  kcal_each integer CHECK (kcal_each IS NULL OR kcal_each >= 0),
  external_key text UNIQUE,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS food_dishes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) > 0),
  slug text NOT NULL UNIQUE,
  servings integer NOT NULL DEFAULT 1 CHECK (servings BETWEEN 1 AND 50),
  notes text,
  external_key text UNIQUE,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS food_dish_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dish_id uuid NOT NULL REFERENCES food_dishes (id),
  position integer NOT NULL CHECK (position >= 0),
  name text NOT NULL,
  quantity_milli integer NOT NULL CHECK (quantity_milli > 0),
  unit text NOT NULL CHECK (unit IN ('g', 'ml', 'un')),
  food_item_id uuid REFERENCES food_items (id),
  kcal integer CHECK (kcal IS NULL OR kcal >= 0),
  UNIQUE (dish_id, position)
);

CREATE TABLE IF NOT EXISTS food_shopping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) > 0),
  quantity_milli integer CHECK (quantity_milli IS NULL OR quantity_milli > 0),
  unit text CHECK (unit IS NULL OR unit IN ('g', 'ml', 'un')),
  food_item_id uuid REFERENCES food_items (id),
  bought_at timestamptz,
  external_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS food_shopping_open_item
  ON food_shopping (food_item_id)
  WHERE bought_at IS NULL AND food_item_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS food_meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  eaten_on date NOT NULL,
  family_member_id uuid REFERENCES family_members (id),
  dish_id uuid REFERENCES food_dishes (id),
  title text NOT NULL,
  servings_milli integer NOT NULL CHECK (servings_milli > 0),
  kcal integer NOT NULL CHECK (kcal >= 0),
  external_key text,
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS food_meals_external_key_key ON food_meals (external_key);
CREATE INDEX IF NOT EXISTS food_meals_day ON food_meals (eaten_on) WHERE voided_at IS NULL;

INSERT INTO schema_migrations (version)
VALUES ('012_food')
ON CONFLICT (version) DO NOTHING;
