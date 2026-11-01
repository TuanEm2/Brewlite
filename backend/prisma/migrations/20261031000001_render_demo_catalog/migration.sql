-- One-time DEMO catalog bootstrap for a completely empty Render PostgreSQL.
-- No DELETE / TRUNCATE / UPDATE. Nothing is inserted if Product, Ingredient,
-- or ProductIngredient already contains rows. This is sample data, not customer data.
BEGIN;
DO $bootstrap$
BEGIN
  IF EXISTS (SELECT 1 FROM "Product")
     OR EXISTS (SELECT 1 FROM "Ingredient")
     OR EXISTS (SELECT 1 FROM "ProductIngredient") THEN
    RAISE NOTICE 'Demo catalog migration skipped: product/ingredient data already exists.';
    RETURN;
  END IF;

  INSERT INTO "Product" ("name", "price", "imageUrl", "stock", "version", "sizes", "toppings")
  VALUES
    ('Cà phê sữa', 35000, 'https://placehold.co/400x400?text=Ca+Phe+Sua', 100, 0,
       '[{"name":"S","price":0},{"name":"M","price":5000},{"name":"L","price":10000}]'::jsonb,
       '[{"name":"Trân châu","price":5000},{"name":"Kem","price":10000}]'::jsonb),
    ('Americano', 40000, 'https://placehold.co/400x400?text=Americano', 100, 0,
       '[{"name":"S","price":0},{"name":"M","price":5000},{"name":"L","price":10000}]'::jsonb,
       '[{"name":"Trân châu","price":5000},{"name":"Kem","price":10000}]'::jsonb),
    ('Cappuccino', 45000, 'https://placehold.co/400x400?text=Cappuccino', 100, 0,
       '[{"name":"S","price":0},{"name":"M","price":5000},{"name":"L","price":10000}]'::jsonb,
       '[{"name":"Trân châu","price":5000},{"name":"Kem","price":10000}]'::jsonb),
    ('Trà đào', 39000, 'https://placehold.co/400x400?text=Tra+Dao', 100, 0,
       '[{"name":"S","price":0},{"name":"M","price":5000},{"name":"L","price":10000}]'::jsonb,
       '[{"name":"Trân châu","price":5000},{"name":"Kem","price":10000}]'::jsonb);

  INSERT INTO "Ingredient" ("code", "name", "unit", "stock", "version")
  VALUES
    ('COFFEE', 'Cà phê', 'G', 1000, 0),
    ('CONDENSED_MILK', 'Sữa đặc', 'ML', 1000, 0),
    ('FRESH_MILK', 'Sữa tươi', 'ML', 2000, 0),
    ('TEA', 'Trà', 'G', 500, 0),
    ('PEACH_SYRUP', 'Siro đào', 'ML', 1000, 0),
    ('WATER', 'Nước', 'ML', 10000, 0),
    ('PEARL', 'Trân châu', 'G', 1000, 0),
    ('CREAM', 'Kem', 'G', 1000, 0),
    ('CUP', 'Ly', 'PIECE', 100, 0);

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
  JOIN "Ingredient" i ON i."code" = recipe."ingredientCode";

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
  WHERE p."name" IN ('Cà phê sữa', 'Americano', 'Cappuccino', 'Trà đào');

  RAISE NOTICE 'Demo catalog inserted: 4 products, 9 ingredients, 66 recipe rows.';
END;
$bootstrap$;
COMMIT;
