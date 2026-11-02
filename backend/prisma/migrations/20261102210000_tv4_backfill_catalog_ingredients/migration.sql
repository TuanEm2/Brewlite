-- TV4: backfill recipes for Render catalogs created before the ingredient migration.
-- Data source: the same sample recipes already defined in
--   20261031000001_render_demo_catalog/migration.sql
-- This migration only INSERTs missing rows; never updates existing recipes,
-- stock counts, products, orders, payments, or users.
-- IMPORTANT: newly created Ingredient rows have stock = 0 (unverified).
-- Before accepting orders against the new recipe, inventory must be counted
-- and entered separately by a responsible operator. No fake live stock.
BEGIN;

DO $tv4_check$
DECLARE p RECORD;
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Product"
    WHERE "name" IN ('Cà phê sữa', 'Americano', 'Cappuccino', 'Trà đào')
    GROUP BY "name" HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'TV4 inventory backfill: duplicate demo product names; manual reconciliation required';
  END IF;

  FOR p IN
    SELECT "id", "name", "sizes", "toppings"
    FROM "Product"
    WHERE "name" IN ('Cà phê sữa', 'Americano', 'Cappuccino', 'Trà đào')
  LOOP
    IF jsonb_typeof(p."sizes"::jsonb) IS DISTINCT FROM 'array'
       OR jsonb_typeof(p."toppings"::jsonb) IS DISTINCT FROM 'array'
       OR EXISTS (
         SELECT 1 FROM (VALUES ('S'), ('M'), ('L')) AS sz("name")
         WHERE NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(p."sizes"::jsonb) = 'array'
               THEN p."sizes"::jsonb ELSE '[]'::jsonb END
           ) AS option
           WHERE option->>'name' = sz."name"
         )
       )
       OR EXISTS (
         SELECT 1 FROM (VALUES ('Trân châu'), ('Kem')) AS top("name")
         WHERE NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(p."toppings"::jsonb) = 'array'
               THEN p."toppings"::jsonb ELSE '[]'::jsonb END
           ) AS option
           WHERE option->>'name' = top."name"
         )
       ) THEN
      RAISE EXCEPTION 'TV4 inventory backfill: product % (%) has non-demo size/topping options; reconcile before applying', p."name", p."id";
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM "Ingredient" i
    JOIN (VALUES
      ('COFFEE','G'), ('CONDENSED_MILK','ML'), ('FRESH_MILK','ML'),
      ('TEA','G'), ('PEACH_SYRUP','ML'), ('WATER','ML'),
      ('PEARL','G'), ('CREAM','G'), ('CUP','PIECE')
    ) AS expected("code","unit") ON expected."code" = i."code"
    WHERE i."unit"::text <> expected."unit"
  ) THEN
    RAISE EXCEPTION 'TV4 inventory backfill: ingredient unit mismatch; manual reconciliation required';
  END IF;
END
$tv4_check$;

-- No stock was verified for newly inserted ingredients: initialize to zero.
-- Existing positive or zero inventory remains UNCHANGED.
INSERT INTO "Ingredient" ("code","name","unit","stock","version")
VALUES
  ('COFFEE', 'Cà phê', 'G', 0, 0),
  ('CONDENSED_MILK', 'Sữa đặc', 'ML', 0, 0),
  ('FRESH_MILK', 'Sữa tươi', 'ML', 0, 0),
  ('TEA', 'Trà', 'G', 0, 0),
  ('PEACH_SYRUP', 'Siro đào', 'ML', 0, 0),
  ('WATER', 'Nước', 'ML', 0, 0),
  ('PEARL', 'Trân châu', 'G', 0, 0),
  ('CREAM', 'Kem', 'G', 0, 0),
  ('CUP', 'Ly', 'PIECE', 0, 0)
ON CONFLICT ("code") DO NOTHING;

  -- Base recipe per product and size.
  INSERT INTO "ProductIngredient" ("productId", "ingredientId", "size", "topping", "quantity")
  SELECT p."id", i."id", recipe."size"::"RecipeSize", '', recipe."qty"
  FROM (VALUES
      ('Cà phê sữa', 'S', 'COFFEE', 18),
      ('Cà phê sữa', 'S', 'CONDENSED_MILK', 25),
      ('Cà phê sữa', 'S', 'WATER', 60),
      ('Cà phê sữa', 'S', 'CUP', 1),
      ('Cà phê sữa', 'M', 'COFFEE', 22),
      ('Cà phê sữa', 'M', 'CONDENSED_MILK', 30),
      ('Cà phê sữa', 'M', 'WATER', 80),
      ('Cà phê sữa', 'M', 'CUP', 1),
      ('Cà phê sữa', 'L', 'COFFEE', 26),
      ('Cà phê sữa', 'L', 'CONDENSED_MILK', 35),
      ('Cà phê sữa', 'L', 'WATER', 100),
      ('Cà phê sữa', 'L', 'CUP', 1),
      ('Americano', 'S', 'COFFEE', 18),
      ('Americano', 'S', 'WATER', 120),
      ('Americano', 'S', 'CUP', 1),
      ('Americano', 'M', 'COFFEE', 22),
      ('Americano', 'M', 'WATER', 160),
      ('Americano', 'M', 'CUP', 1),
      ('Americano', 'L', 'COFFEE', 26),
      ('Americano', 'L', 'WATER', 200),
      ('Americano', 'L', 'CUP', 1),
      ('Cappuccino', 'S', 'COFFEE', 18),
      ('Cappuccino', 'S', 'FRESH_MILK', 120),
      ('Cappuccino', 'S', 'CUP', 1),
      ('Cappuccino', 'M', 'COFFEE', 22),
      ('Cappuccino', 'M', 'FRESH_MILK', 160),
      ('Cappuccino', 'M', 'CUP', 1),
      ('Cappuccino', 'L', 'COFFEE', 26),
      ('Cappuccino', 'L', 'FRESH_MILK', 200),
      ('Cappuccino', 'L', 'CUP', 1),
      ('Trà đào', 'S', 'TEA', 5),
      ('Trà đào', 'S', 'WATER', 120),
      ('Trà đào', 'S', 'PEACH_SYRUP', 20),
      ('Trà đào', 'S', 'CUP', 1),
      ('Trà đào', 'M', 'TEA', 6),
      ('Trà đào', 'M', 'WATER', 160),
      ('Trà đào', 'M', 'PEACH_SYRUP', 25),
      ('Trà đào', 'M', 'CUP', 1),
      ('Trà đào', 'L', 'TEA', 7),
      ('Trà đào', 'L', 'WATER', 200),
      ('Trà đào', 'L', 'PEACH_SYRUP', 30),
      ('Trà đào', 'L', 'CUP', 1)
  ) AS recipe("productName", "size", "ingredientCode", "qty")
  JOIN "Product" p ON p."name" = recipe."productName"
  JOIN "Ingredient" i ON i."code" = recipe."ingredientCode"
  ON CONFLICT ("productId", "ingredientId", "size", "topping") DO NOTHING;

  -- Optional toppings apply to each drink and each size; never consume unless selected.
  INSERT INTO "ProductIngredient" ("productId", "ingredientId", "size", "topping", "quantity")
  SELECT p."id", i."id", sz."size"::"RecipeSize", topping."name", topping."qty"
  FROM "Product" p
  CROSS JOIN (VALUES ('S'), ('M'), ('L')) AS sz("size")
  CROSS JOIN (VALUES
    ('Trân châu', 'PEARL', 30),
    ('Kem', 'CREAM', 20)
  ) AS topping("name", "ingredientCode", "qty")
  JOIN "Ingredient" i ON i."code" = topping."ingredientCode"
  WHERE p."name" IN ('Cà phê sữa', 'Americano', 'Cappuccino', 'Trà đào')
  ON CONFLICT ("productId", "ingredientId", "size", "topping") DO NOTHING;
COMMIT;
