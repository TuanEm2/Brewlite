BEGIN;

-- CreateEnum
CREATE TYPE "IngredientUnit" AS ENUM ('G', 'ML', 'PIECE');

-- CreateEnum
CREATE TYPE "RecipeSize" AS ENUM ('S', 'M', 'L');

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "IngredientUnit" NOT NULL,
    "stock" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductIngredient" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "ingredientId" INTEGER NOT NULL,
    "size" "RecipeSize" NOT NULL,
    "topping" TEXT NOT NULL DEFAULT '',
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "ProductIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderIngredient" (
    "orderId" INTEGER NOT NULL,
    "ingredientId" INTEGER NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "OrderIngredient_pkey" PRIMARY KEY ("orderId","ingredientId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_code_key" ON "Ingredient"("code");

-- CreateIndex
CREATE INDEX "ProductIngredient_ingredientId_idx" ON "ProductIngredient"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductIngredient_productId_ingredientId_size_topping_key" ON "ProductIngredient"("productId", "ingredientId", "size", "topping");

-- CreateIndex
CREATE INDEX "OrderIngredient_ingredientId_idx" ON "OrderIngredient"("ingredientId");

-- AddForeignKey
ALTER TABLE "ProductIngredient" ADD CONSTRAINT "ProductIngredient_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductIngredient" ADD CONSTRAINT "ProductIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderIngredient" ADD CONSTRAINT "OrderIngredient_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderIngredient" ADD CONSTRAINT "OrderIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma không biểu diễn CHECK trong schema; giữ các ràng buộc này trong migration.
ALTER TABLE "Ingredient"
    ADD CONSTRAINT "Ingredient_stock_nonnegative" CHECK ("stock" >= 0),
    ADD CONSTRAINT "Ingredient_version_nonnegative" CHECK ("version" >= 0),
    ADD CONSTRAINT "Ingredient_piece_stock_integer" CHECK ("unit" <> 'PIECE' OR "stock" = trunc("stock"));

ALTER TABLE "ProductIngredient"
    ADD CONSTRAINT "ProductIngredient_quantity_positive" CHECK ("quantity" > 0),
    ADD CONSTRAINT "ProductIngredient_topping_trimmed" CHECK ("topping" = btrim("topping"));

ALTER TABLE "OrderIngredient"
    ADD CONSTRAINT "OrderIngredient_quantity_positive" CHECK ("quantity" > 0);

COMMIT;
