import 'dotenv/config';
import { PrismaClient, Prisma, IngredientUnit, RecipeSize } from '@prisma/client';

const prisma = new PrismaClient();

const sizes: Prisma.InputJsonValue = [
  { name: 'S', price: 0 },
  { name: 'M', price: 5000 },
  { name: 'L', price: 10000 },
];

const toppings: Prisma.InputJsonValue = [
  { name: 'Trân châu', price: 5000 },
  { name: 'Kem', price: 10000 },
];

// Định nghĩa dữ liệu nguyên liệu demo
const ingredients = [
  { code: 'COFFEE', name: 'Cà phê', unit: IngredientUnit.G, stock: '1000' },
  { code: 'CONDENSED_MILK', name: 'Sữa đặc', unit: IngredientUnit.ML, stock: '1000' },
  { code: 'FRESH_MILK', name: 'Sữa tươi', unit: IngredientUnit.ML, stock: '2000' },
  { code: 'TEA', name: 'Trà', unit: IngredientUnit.G, stock: '500' },
  { code: 'PEACH_SYRUP', name: 'Siro đào', unit: IngredientUnit.ML, stock: '1000' },
  { code: 'WATER', name: 'Nước', unit: IngredientUnit.ML, stock: '10000' },
  { code: 'PEARL', name: 'Trân châu', unit: IngredientUnit.G, stock: '1000' },
  { code: 'CREAM', name: 'Kem', unit: IngredientUnit.G, stock: '1000' },
  { code: 'CUP', name: 'Ly', unit: IngredientUnit.PIECE, stock: '100' },
] as const;

type Recipe = Record<RecipeSize, Record<string, string>>;
const recipes: Record<string, Recipe> = {
  'Cà phê sữa': {
    S: { COFFEE: '18', CONDENSED_MILK: '25', WATER: '60', CUP: '1' },
    M: { COFFEE: '22', CONDENSED_MILK: '30', WATER: '80', CUP: '1' },
    L: { COFFEE: '26', CONDENSED_MILK: '35', WATER: '100', CUP: '1' },
  },
  Americano: {
    S: { COFFEE: '18', WATER: '120', CUP: '1' },
    M: { COFFEE: '22', WATER: '160', CUP: '1' },
    L: { COFFEE: '26', WATER: '200', CUP: '1' },
  },
  Cappuccino: {
    S: { COFFEE: '18', FRESH_MILK: '120', CUP: '1' },
    M: { COFFEE: '22', FRESH_MILK: '160', CUP: '1' },
    L: { COFFEE: '26', FRESH_MILK: '200', CUP: '1' },
  },
  'Trà đào': {
    S: { TEA: '5', WATER: '120', PEACH_SYRUP: '20', CUP: '1' },
    M: { TEA: '6', WATER: '160', PEACH_SYRUP: '25', CUP: '1' },
    L: { TEA: '7', WATER: '200', PEACH_SYRUP: '30', CUP: '1' },
  },
};

const toppingRecipes = [
  { topping: 'Trân châu', code: 'PEARL', quantity: '30' },
  { topping: 'Kem', code: 'CREAM', quantity: '20' },
] as const;

function optionNames(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) =>
    option && typeof option === 'object' && !Array.isArray(option) && typeof option.name === 'string'
      ? [option.name]
      : [],
  );
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed xóa dữ liệu đơn hàng và sản phẩm, không chạy trên production.');
  }

  // 1. Xóa sạch dữ liệu mẫu cũ, nguyên liệu cũ liên quan và đặt lại id về 1
  await prisma.$executeRaw`TRUNCATE TABLE "Payment", "OrderItem", "Order", "ProductIngredient", "Ingredient", "Product" RESTART IDENTITY CASCADE`;

  // 2. Tạo 4 sản phẩm mẫu
  const products = await prisma.product.createManyAndReturn({
    data: [
      {
        name: 'Cà phê sữa',
        price: 35000,
        imageUrl: 'https://placehold.co/400x400?text=Ca+Phe+Sua',
        stock: 100,
        sizes,
        toppings,
      },
      {
        name: 'Americano',
        price: 40000,
        imageUrl: 'https://placehold.co/400x400?text=Americano',
        stock: 100,
        sizes,
        toppings,
      },
      {
        name: 'Cappuccino',
        price: 45000,
        imageUrl: 'https://placehold.co/400x400?text=Cappuccino',
        stock: 100,
        sizes,
        toppings,
      },
      {
        name: 'Trà đào',
        price: 39000,
        imageUrl: 'https://placehold.co/400x400?text=Tra+Dao',
        stock: 100,
        sizes,
        toppings,
      },
    ],
  });

  console.log('Seeded 4 sample products successfully.');

  // 3. Nạp nguyên liệu và công thức chi tiết
  const ingredientIds = new Map<string, number>();
  for (const item of ingredients) {
    const ingredient = await prisma.ingredient.upsert({
      where: { code: item.code },
      create: { ...item, stock: new Prisma.Decimal(item.stock) },
      update: { stock: new Prisma.Decimal(item.stock) }, // Cho phép reset stock khi seed lại
    });
    ingredientIds.set(item.code, ingredient.id);
  }

  for (const product of products) {
    for (const size of Object.values(RecipeSize)) {
      const rows = [
        ...Object.entries(recipes[product.name][size]).map(([code, quantity]) => ({ code, quantity, topping: '' })),
        ...toppingRecipes,
      ];
      for (const row of rows) {
        const ingredientId = ingredientIds.get(row.code);
        if (ingredientId === undefined) throw new Error(`Chưa có nguyên liệu ${row.code}`);
        const identity = { productId: product.id, ingredientId, size, topping: row.topping };
        await prisma.productIngredient.upsert({
          where: { productId_ingredientId_size_topping: identity },
          create: { ...identity, quantity: new Prisma.Decimal(row.quantity) },
          update: { quantity: new Prisma.Decimal(row.quantity) },
        });
      }
    }
  }

  console.log('Seeded 9 ingredients and product recipes successfully.');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });