import 'dotenv/config';
import { IngredientUnit, Prisma, PrismaClient, RecipeSize } from '@prisma/client';

// Công thức MINH HỌA cho đồ án, không phải công thức vận hành của cửa hàng thật.
// stock chỉ được dùng lúc tạo nguyên liệu mới; chạy lại KHÔNG tự nạp lại kho.
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

export async function seedIngredientDemo(prisma: PrismaClient): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Dữ liệu nguyên liệu chỉ dùng cho demo; không nạp trên production.');
  }

  await prisma.$transaction(async (tx) => {
    const products = await tx.product.findMany({ where: { name: { in: Object.keys(recipes) } } });
    // Kiểm tra đủ sản phẩm/lựa chọn TRƯỚC khi ghi. Không đoán theo id 1..4.
    for (const name of Object.keys(recipes)) {
      const matches = products.filter((product) => product.name === name);
      if (matches.length !== 1) {
        throw new Error(`Cần đúng một sản phẩm "${name}" trước khi nạp công thức demo.`);
      }
      const sizes = optionNames(matches[0].sizes);
      const toppings = optionNames(matches[0].toppings);
      if (!Object.values(RecipeSize).every((size) => sizes.includes(size)) ||
          !toppingRecipes.every(({ topping }) => toppings.includes(topping))) {
        throw new Error(`Size/topping của "${name}" không khớp bộ demo; chưa thay đổi dữ liệu.`);
      }
    }

    const ingredientIds = new Map<string, number>();
    for (const item of ingredients) {
      const ingredient = await tx.ingredient.upsert({
        where: { code: item.code },
        create: { ...item, stock: new Prisma.Decimal(item.stock) },
        update: {},
      });
      if (ingredient.unit !== item.unit) {
        throw new Error(`Nguyên liệu ${item.code} đang dùng đơn vị khác; không tự quy đổi kho.`);
      }
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
          await tx.productIngredient.upsert({
            where: { productId_ingredientId_size_topping: identity },
            create: { ...identity, quantity: new Prisma.Decimal(row.quantity) },
            update: {}, // Giữ công thức mà nhóm đã chỉnh, không ghi đè bằng bản mẫu.
          });
        }
      }
    }
  }, { timeout: 30000 });
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedIngredientDemo(prisma)
    .then(() => console.log('Đã nạp/kiểm tra 9 nguyên liệu và công thức 4 sản phẩm × 3 size; giữ nguyên tồn kho/công thức đã có.'))
    .catch((error: unknown) => { console.error(error); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
