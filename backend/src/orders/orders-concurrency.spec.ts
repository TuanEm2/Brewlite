/// <reference types="jest" />
import { describe, beforeAll, it, expect } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';

describe('Task 10 (TV4) - Optimistic Locking & Concurrent Stock Test', () => {
  let service: OrdersService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrdersService, PrismaService, ProductsService],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('phải ngăn chặn bán vượt số lượng tồn kho (Over-selling) khi có 10 request gửi đồng thời', async () => {
    // 1. Tạo 1 sản phẩm giả lập có tồn kho = 3
    const testProduct = await prisma.product.create({
      data: {
        name: 'Trà Sữa Test Concurrent',
        price: 30000,
        imageUrl: '/test.png',
        stock: 3,
        version: 0,
        sizes: [{ name: 'S', price: 0 }],
        toppings: [],
      },
    });

    // 2. Bắn 10 request mua hàng cùng lúc (Mỗi request mua 1 sản phẩm)
    const requests = Array.from({ length: 10 }).map((_, index) =>
      service
        .createPending(null, {
          items: [
            {
              productId: testProduct.id,
              size: 'S',
              toppings: [],
              quantity: 1,
            },
          ],
          idempotencyKey: `concurrent-test-key-${index}-${Date.now()}`,
        })
        .then(() => ({ status: 'fulfilled' }))
        .catch((err) => ({ status: 'rejected', reason: err.message })),
    );

    const results = await Promise.all(requests);

    const successfulOrders = results.filter((r) => r.status === 'fulfilled');

    // 3. Nghiệm thu:
    // - Số lượng đơn tạo thành công phải luôn <= 3 (Tồn kho ban đầu)
    expect(successfulOrders.length).toBeLessThanOrEqual(3);

    // - Tồn kho thực tế trong DB sau khi chạy xong phải >= 0
    const updatedProduct = await prisma.product.findUnique({
      where: { id: testProduct.id },
    });

    expect(updatedProduct?.stock).toBe(3 - successfulOrders.length);
    expect(updatedProduct?.stock).toBeGreaterThanOrEqual(0);

    // Dọn dẹp dữ liệu test theo đúng thứ tự khóa ngoại
    // Xóa các OrderItem tham gia vào sản phẩm này trước
    await prisma.orderItem.deleteMany({
      where: { productId: testProduct.id },
    });

    // Sau đó có thể dọn dẹp các Order trống nếu cần, hoặc xóa trực tiếp Product
    await prisma.product.delete({ where: { id: testProduct.id } });
  });
});