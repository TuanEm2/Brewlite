import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';

describe('Đặt hàng đồng thời — tồn kho', () => {
  let moduleRef: TestingModule;
  let service: OrdersService;
  let prisma: PrismaService;
  let productId: number | undefined;

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
        // Chỉ tìm và xóa đơn dùng sản phẩm riêng của test này.
        const orders = await prisma.order.findMany({
          where: {
            items: { some: { productId } },
          },
          select: { id: true },
        });

        await prisma.order.deleteMany({
          where: { id: { in: orders.map((order) => order.id) } },
        });

        await prisma.product.delete({
          where: { id: productId },
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

  it('10 yêu cầu mua không bán vượt tồn kho 3 sản phẩm', async () => {
    const product = await prisma.product.create({
      data: {
        name: `Concurrent test ${randomUUID()}`,
        price: 30000,
        imageUrl: '/test.png',
        stock: 3,
        version: 0,
        sizes: [{ name: 'S', price: 0 }],
        toppings: [],
      },
    });
    productId = product.id;

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

    const updated = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });

    expect(updated.stock).toBe(3 - successful.length);
    expect(updated.version).toBe(successful.length);

    const savedOrders = await prisma.order.count({
      where: {
        items: { some: { productId: product.id } },
      },
    });
    expect(savedOrders).toBe(successful.length);
  }, 15000);
});