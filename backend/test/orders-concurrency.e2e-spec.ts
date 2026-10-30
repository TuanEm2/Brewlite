import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from '../src/orders/orders.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductsService } from '../src/products/products.service';

describe('Đặt hàng đồng thời — tồn kho nguyên liệu', () => {
  let moduleRef: TestingModule;
  let service: OrdersService;
  let prisma: PrismaService;
  let productId: number | undefined;
  let ingredientId: number | undefined;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [OrdersService, PrismaService, ProductsService],
    }).compile();

    service = moduleRef.get(OrdersService);
    prisma = moduleRef.get(PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    try {
      if (prisma && productId !== undefined) {
        // Xóa đơn hàng liên quan đến sản phẩm test
        const orders = await prisma.order.findMany({
          where: {
            items: { some: { productId } },
          },
          select: { id: true },
        });

        await prisma.order.deleteMany({
          where: { id: { in: orders.map((order) => order.id) } },
        });

        // Xóa bảng liên kết sản phẩm - nguyên liệu
        await prisma.productIngredient.deleteMany({
          where: { productId },
        });

        await prisma.product.delete({
          where: { id: productId },
        });
      }

      if (prisma && ingredientId !== undefined) {
        await prisma.ingredient.delete({
          where: { id: ingredientId },
        });
      }
    } finally {
      try {
        await prisma?.$disconnect();
      } finally {
        await moduleRef?.close();
      }
    }
  });

  it('10 yêu cầu mua không bán vượt tồn kho nguyên liệu (tồn kho nguyên liệu = 3)', async () => {
    // 1. Tạo nguyên liệu mẫu với đầy đủ code, unit, stock và version
    const ingredient = await prisma.ingredient.create({
      data: {
        code: `ING_${randomUUID().substring(0, 8)}`,
        name: `Test Ingredient ${randomUUID()}`,
        unit: 'G',
        stock: 3,
        version: 0,
      },
    });
    ingredientId = ingredient.id;

    // 2. Tạo sản phẩm mẫu độc lập
    const product = await prisma.product.create({
      data: {
        name: `Concurrent test product ${randomUUID()}`,
        price: 30000,
        imageUrl: '/test.png',
        sizes: [{ name: 'S', price: 0 }],
        toppings: [],
      },
    });
    productId = product.id;

    // 3. Tạo liên kết ProductIngredient thủ công để gắn nguyên liệu vào sản phẩm
    await prisma.productIngredient.create({
      data: {
        productId: product.id,
        ingredientId: ingredient.id,
        quantity: 1, // Mỗi 1 ly tiêu tốn 1 đơn vị nguyên liệu này
        size: 'S',
        topping: '',
      },
    });

    // 4. Giả lập 10 request mua hàng đồng thời
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        service.createPending(null, {
          items: [{
            productId: product.id,
            size: 'S',
            toppings: [],
            quantity: 1,
          }],
          idempotencyKey: randomUUID(),
        }),
      ),
    );

    const successful = results.filter(
      (result) => result.status === 'fulfilled',
    );

    // Không chấp nhận test "đạt" khi toàn bộ yêu cầu đều thất bại.
    expect(successful.length).toBeGreaterThan(0);
    expect(successful.length).toBeLessThanOrEqual(3);

    for (const result of results) {
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(ConflictException);
      }
    }

    // 5. Kiểm tra tồn kho và version của bảng nguyên liệu sau khi xử lý đồng thời
    const updatedIngredient = await prisma.ingredient.findUniqueOrThrow({
      where: { id: ingredient.id },
    });

   expect(Number(updatedIngredient.stock)).toBe(3 - successful.length);
    expect(updatedIngredient.version).toBe(successful.length);

    const savedOrders = await prisma.order.count({
      where: {
        items: { some: { productId: product.id } },
      },
    });
    expect(savedOrders).toBe(successful.length);
  }, 15000);
});