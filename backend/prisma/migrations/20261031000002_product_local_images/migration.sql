-- Point BrewLite demo catalog at local product photographs.
-- Add the four matching JPG files under frontend/public/images/ before deploying the web.
-- Only replace the original placeholder URLs; preserve custom user-provided image URLs.
UPDATE "Product"
SET "imageUrl" = CASE "name"
  WHEN 'Cà phê sữa' THEN '/images/ca-phe-sua.jpg'
  WHEN 'Americano' THEN '/images/americano.jpg'
  WHEN 'Cappuccino' THEN '/images/cappuccino.jpg'
  WHEN 'Trà đào' THEN '/images/tra-dao.jpg'
  ELSE "imageUrl"
END
WHERE "name" IN ('Cà phê sữa', 'Americano', 'Cappuccino', 'Trà đào')
  AND "imageUrl" LIKE 'https://placehold.co/%';
