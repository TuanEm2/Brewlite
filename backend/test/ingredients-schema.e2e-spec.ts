import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { IngredientUnit, Prisma, PrismaClient, RecipeSize } from '@prisma/client';
import { seedIngredientDemo } from '../prisma/seed-ingredients';

describe('TV2 — schema kho nguyên liệu (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const productIds: number[] = [];
  const ingredientIds: number[] = [];
  const orderIds: number[] = [];
  let coffeeId: number;
  let cupId: number;
  let recipeId: number;
  let databaseVerified = false;

  beforeAll(async () => {
    const database = new URL(process.env.DATABASE_URL ?? '').pathname;
    if (!database.toLowerCase().includes('test')) {
      throw new Error('Chỉ chạy test nguyên liệu trên database có tên chứa "test".');
    }
    databaseVerified = true;
    await prisma.$connect();
    for (let index = 0; index < 2; index++) {
      const product = await prisma.product.create({
        data: { name: `Ingredient test ${randomUUID()}`, price: 30000, imageUrl: '/test.png', sizes: [], toppings: [] },
      });
      productIds.push(product.id);
    }
    const coffee = await prisma.ingredient.create({
      data: { code: `TEST_COFFEE_${randomUUID()}`, name: 'Cà phê thử', unit: IngredientUnit.G, stock: '10.500' },
    });
    const cup = await prisma.ingredient.create({
      data: { code: `TEST_CUP_${randomUUID()}`, name: 'Ly thử', unit: IngredientUnit.PIECE, stock: '10' },
    });
    coffeeId = coffee.id;
    cupId = cup.id;
    ingredientIds.push(coffee.id, cup.id);
  });

  afterAll(async () => {
    if (!databaseVerified) {
      await prisma.$disconnect();
      return;
    }
    try {
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
      await prisma.ingredient.deleteMany({ where: { id: { in: ingredientIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('dùng chung nguyên liệu giữa sản phẩm, tách định lượng theo size và topping', async () => {
    const recipe = await prisma.productIngredient.create({
      data: { productId: productIds[0], ingredientId: coffeeId, size: RecipeSize.S, quantity: '0.125' },
    });
    recipeId = recipe.id;
    await prisma.productIngredient.createMany({ data: [
      { productId: productIds[0], ingredientId: coffeeId, size: RecipeSize.M, quantity: '0.250' },
      { productId: productIds[0], ingredientId: coffeeId, size: RecipeSize.M, topping: 'Thêm cà phê', quantity: '0.125' },
      { productId: productIds[1], ingredientId: coffeeId, size: RecipeSize.S, quantity: '0.125' },
    ] });
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productIds[0] },
      include: { ingredients: { where: { size: RecipeSize.M }, include: { ingredient: true } } },
    });
    expect(product.ingredients).toHaveLength(2);
    const perCup = product.ingredients.reduce((sum, row) => sum.plus(row.quantity), new Prisma.Decimal(0));
    expect(perCup.mul(3).toString()).toBe('1.125');
    expect(product.ingredients.every((row) => row.ingredient.id === coffeeId)).toBe(true);
  });

  it('không cho tạo hai dòng trùng cùng sản phẩm, nguyên liệu, size, topping', async () => {
    await expect(prisma.productIngredient.create({
      data: { productId: productIds[0], ingredientId: coffeeId, size: RecipeSize.S, quantity: '1' },
    })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('chặn tồn âm, version âm và số ly lẻ ngay tại database', async () => {
    await expect(prisma.ingredient.update({ where: { id: coffeeId }, data: { stock: '-0.001' } })).rejects.toThrow();
    await expect(prisma.ingredient.update({ where: { id: coffeeId }, data: { version: -1 } })).rejects.toThrow();
    await expect(prisma.ingredient.update({ where: { id: cupId }, data: { stock: '0.500' } })).rejects.toThrow();
    const coffee = await prisma.ingredient.findUniqueOrThrow({ where: { id: coffeeId } });
    expect(coffee.stock.toString()).toBe('10.5');
    expect(coffee.version).toBe(0);
  });

  it('chặn định lượng bằng 0 hoặc âm, kể cả snapshot của đơn', async () => {
    await expect(prisma.productIngredient.create({
      data: { productId: productIds[0], ingredientId: coffeeId, size: RecipeSize.L, quantity: '0' },
    })).rejects.toThrow();
    const order = await prisma.order.create({ data: { total: 0 } });
    orderIds.push(order.id);
    await expect(prisma.orderIngredient.create({
      data: { orderId: order.id, ingredientId: coffeeId, quantity: '-1' },
    })).rejects.toThrow();
    expect(await prisma.orderIngredient.count({ where: { orderId: order.id } })).toBe(0);
  });

  it('giữ lượng đã dùng của đơn khi công thức đổi và chặn xóa nguyên liệu đang được tham chiếu', async () => {
    const order = await prisma.order.create({ data: { total: 0 } });
    orderIds.push(order.id);
    await prisma.orderIngredient.create({ data: { orderId: order.id, ingredientId: coffeeId, quantity: '0.375' } });
    await prisma.productIngredient.update({ where: { id: recipeId }, data: { quantity: '0.500' } });
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { ingredientUsages: true } });
    expect(stored.ingredientUsages[0].quantity.toString()).toBe('0.375');
    // PostgreSQL 16/18 có thể trả SQLSTATE khác nhau cho ON DELETE RESTRICT.
    await expect(prisma.ingredient.delete({ where: { id: coffeeId } })).rejects.toThrow(/ingredientId_fkey/);
    expect(await prisma.ingredient.count({ where: { id: coffeeId } })).toBe(1);
  });

  it('nạp demo lặp lại không tự tăng kho hoặc ghi đè công thức đã sửa', async () => {
    const demoProductIds: number[] = [];
    const previousIngredientIds = new Set((await prisma.ingredient.findMany({ select: { id: true } })).map((row) => row.id));
    let demoCoffeeId: number | undefined;
    let originalStock: Prisma.Decimal | undefined;
    let changedRecipeId: number | undefined;
    let originalQuantity: Prisma.Decimal | undefined;
    try {
      for (const name of ['Cà phê sữa', 'Americano', 'Cappuccino', 'Trà đào']) {
        if (await prisma.product.findFirst({ where: { name } })) continue;
        const product = await prisma.product.create({ data: {
          name, price: 45000, imageUrl: '/test.png',
          sizes: ['S', 'M', 'L'].map((size) => ({ name: size, price: 0 })),
          toppings: ['Trân châu', 'Kem'].map((topping) => ({ name: topping, price: 0 })),
        } });
        demoProductIds.push(product.id);
      }
      await seedIngredientDemo(prisma);
      const coffee = await prisma.ingredient.findUniqueOrThrow({ where: { code: 'COFFEE' } });
      demoCoffeeId = coffee.id;
      originalStock = coffee.stock;
      const recipe = await prisma.productIngredient.findFirstOrThrow({ where: { ingredientId: coffee.id } });
      changedRecipeId = recipe.id;
      originalQuantity = recipe.quantity;
      const beforeCount = await prisma.productIngredient.count();
      await prisma.ingredient.update({ where: { id: coffee.id }, data: { stock: '7.125' } });
      await prisma.productIngredient.update({ where: { id: recipe.id }, data: { quantity: '0.875' } });
      await seedIngredientDemo(prisma);
      expect((await prisma.ingredient.findUniqueOrThrow({ where: { id: coffee.id } })).stock.toString()).toBe('7.125');
      expect((await prisma.productIngredient.findUniqueOrThrow({ where: { id: recipe.id } })).quantity.toString()).toBe('0.875');
      expect(await prisma.productIngredient.count()).toBe(beforeCount);
    } finally {
      if (changedRecipeId !== undefined && originalQuantity !== undefined) {
        await prisma.productIngredient.update({ where: { id: changedRecipeId }, data: { quantity: originalQuantity } });
      }
      if (demoCoffeeId !== undefined && originalStock !== undefined) {
        await prisma.ingredient.update({ where: { id: demoCoffeeId }, data: { stock: originalStock } });
      }
      await prisma.product.deleteMany({ where: { id: { in: demoProductIds } } });
      const added = await prisma.ingredient.findMany({ where: { code: { in: [
        'COFFEE', 'CONDENSED_MILK', 'FRESH_MILK', 'TEA', 'PEACH_SYRUP', 'WATER', 'PEARL', 'CREAM', 'CUP',
      ] } }, select: { id: true } });
      // Chỉ xóa mẫu do test tạo; các nguyên liệu đã có trước test được giữ nguyên.
      const removable = added.filter((row) => !previousIngredientIds.has(row.id)).map((row) => row.id);
      await prisma.productIngredient.deleteMany({ where: { ingredientId: { in: removable } } });
      await prisma.ingredient.deleteMany({ where: { id: { in: removable } } });
    }
  }, 30000);
});
