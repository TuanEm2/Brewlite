import 'dotenv/config';
import {
  BadRequestException,
  ConflictException,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { OrdersService } from '../src/orders/orders.service';
import { PrismaService } from '../src/prisma/prisma.service';

// Integration test cho OrdersService trên PostgreSQL thật.
// Dùng sản phẩm riêng, tạo và xóa trong file này để không đụng dữ liệu seed.
const sizes = [
  { name: 'S', price: 0 },
  { name: 'L', price: 10000 },
];
const toppings = [
  { name: 'Trân châu', price: 5000 },
  { name: 'Kem', price: 10000 },
];

describe('OrdersService.createPending (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orders: OrdersService;
  const productIds: number[] = [];
  const orderIds: number[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    orders = app.get(OrdersService);

    for (const data of [
      { name: 'E2E Order Coffee', price: 30000, stock: 5 },
      { name: 'E2E Order Tea', price: 20000, stock: 2 },
    ]) {
      const p = await prisma.product.create({
        data: { ...data, imageUrl: 'https://placehold.co/400x400?text=E2E', sizes, toppings },
      });
      productIds.push(p.id);
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    }
    await app?.close();
  });

  it('tạo đơn PENDING, tự tính giá và lưu đủ size/topping/đơn giá', async () => {
    const [coffee, tea] = productIds;
    const order = await orders.createPending(null, {
      items: [
        { productId: coffee, size: 'L', toppings: ['Kem', 'Trân châu'], quantity: 2 },
        { productId: tea, size: 'S', toppings: [], quantity: 1 },
      ],
    });
    orderIds.push(order.id);

    // Cà phê: 30.000 + 10.000 + 10.000 + 5.000 = 55.000 × 2 = 110.000; Trà: 20.000.
    expect(order).toMatchObject({ status: 'PENDING', total: 130000, discount: 0 });
    expect(order.items).toEqual([
      expect.objectContaining({
        productId: coffee,
        size: 'L',
        toppings: [
          { name: 'Kem', price: 10000 },
          { name: 'Trân châu', price: 5000 },
        ],
        quantity: 2,
        unitPrice: 55000,
        lineTotal: 110000,
      }),
      expect.objectContaining({ productId: tea, size: 'S', toppings: [], unitPrice: 20000, lineTotal: 20000 }),
    ]);

    const saved = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });
    expect(saved.userId).toBeNull();
    expect(saved.status).toBe('PENDING');
    expect(saved.items).toHaveLength(2);
  });

  it('không trừ tồn kho (trừ kho thuộc Task 10)', async () => {
    const product = await prisma.product.findUniqueOrThrow({ where: { id: productIds[0] } });
    expect(product.stock).toBe(5);
  });

  it('404 khi có sản phẩm không tồn tại, không tạo đơn', async () => {
    const before = await prisma.order.count();
    await expect(
      orders.createPending(null, {
        items: [{ productId: 2147483647, size: 'S', toppings: [], quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.order.count()).toBe(before);
  });

  it('400 khi size hoặc topping không thuộc sản phẩm', async () => {
    await expect(
      orders.createPending(null, {
        items: [{ productId: productIds[0], size: 'M', toppings: [], quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('409 khi tổng số lượng các dòng cùng sản phẩm vượt tồn kho', async () => {
    const tea = productIds[1]; // tồn kho 2
    await expect(
      orders.createPending(null, {
        items: [
          { productId: tea, size: 'S', toppings: [], quantity: 2 },
          { productId: tea, size: 'L', toppings: ['Kem'], quantity: 1 },
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
