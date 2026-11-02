-- TV4 / DEMO ONLY. Seed baseline values from backend/prisma/seed-ingredients.ts.
-- These are NOT read from the user's local PostgreSQL snapshot and are NOT verified physical stock.
-- Do NOT merge/deploy this migration to a Render database receiving real payOS payments.
-- First switch the entire website to mock-only, reconcile pending payments,
-- and back up the target database. Test on a copy before any production change.
--
-- Idempotent one-time migration: fill only stock = 0 for the 9 demo ingredients.
-- Do not touch custom positive stock, ProductIngredient, Product, Order,
-- OrderItem, Payment, PayosCheckout, User or any bank transaction.
BEGIN;

UPDATE "Ingredient" AS i
SET
  "stock" = samples."demoStock",
  "version" = i."version" + 1
FROM (VALUES
  ('COFFEE',          1000::numeric),
  ('CONDENSED_MILK',  1000::numeric),
  ('FRESH_MILK',     2000::numeric),
  ('TEA',             500::numeric),
  ('PEACH_SYRUP',    1000::numeric),
  ('WATER',         10000::numeric),
  ('PEARL',          1000::numeric),
  ('CREAM',          1000::numeric),
  ('CUP',             100::numeric)
) AS samples("code", "demoStock")
WHERE i."code" = samples."code"
  AND i."stock" = 0;

COMMIT;
