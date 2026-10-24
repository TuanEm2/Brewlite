import 'dotenv/config';
import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { InvalidOrderTransitionException } from '../src/orders/order-state';
import { OrdersService } from '../src/orders/orders.service';
import { PaymentsService } from '../src/payments/payments.service';
import { PrismaService } from '../src/prisma/prisma.service';

// Integration test Task 10 trên PostgreSQL thật: mọi thay đổi trạng thái (thanh toán và
// changeStatus) phải theo sơ đồ mục 9.1. Dữ liệu riêng, tạo và xóa trong file này.
describe('Order State Machine (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orders: OrdersService;
  let payments: PaymentsService;
  let userId: number;
  let productId: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    orders = app.get(OrdersService);
    payments = app.get(PaymentsService);

    userId = (
      await prisma.user.create({
        data: { email: `state-${randomUUID()}@test.local`, passwordHash: 'x' },
      })
    ).id;
    productId = (
      await prisma.product.create({
        data: {
          name: 'E2E State Coffee',
          price: 30000,
          imageUrl: 'https://placehold.co/400x400?text=E2E',
          stock: 50,
          sizes: [{ name: 'S', price: 0 }],
          toppings: [],
        },
      })
    ).id;
  }, 30000);

  afterAll(async () => {
    if (prisma) {
      await prisma.order.deleteMany({ where: { userId } });
      await prisma.product.deleteMany({ where: { id: productId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await app?.close();
  });

  const newOrder = async () =>
    (
      await orders.createPending(userId, {
        items: [{ productId, size: 'S', toppings: [], quantity: 1 }],
      })
    ).id;
  const pay = (orderId: number, outcome: 'SUCCESS' | 'FAILURE') =>
    payments.mockPayment(userId, {
      orderId,
      method: 'MOCK_QR',
      outcome,
      idempotencyKey: randomUUID(),
    });
  const statusOf = async (orderId: number) =>
    (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status;

  it('luồng chính PENDING → PAID → PREPARING → READY → COMPLETED', async () => {
    const id = await newOrder();
    expect(await statusOf(id)).toBe(OrderStatus.PENDING);
    await pay(id, 'SUCCESS');
    expect(await statusOf(id)).toBe(OrderStatus.PAID);
    for (const next of [OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.COMPLETED]) {
      expect((await orders.changeStatus(id, next)).status).toBe(next);
    }
    expect(await statusOf(id)).toBe(OrderStatus.COMPLETED);
  });

  it('thanh toán lỗi rồi thử lại: PENDING → PAYMENT_FAILED → (PENDING) → PAID', async () => {
    const id = await newOrder();
    expect((await pay(id, 'FAILURE')).status).toBe('PAYMENT_FAILED');
    expect((await pay(id, 'FAILURE')).status).toBe('PAYMENT_FAILED');
    expect((await pay(id, 'SUCCESS')).status).toBe('PAID');
    expect(await statusOf(id)).toBe(OrderStatus.PAID);
  });

  it.each<[OrderStatus, string]>([
    [OrderStatus.PREPARING, 'bỏ qua thanh toán'],
    [OrderStatus.COMPLETED, 'nhảy thẳng tới hoàn tất'],
  ])('chặn PENDING → %s (%s), trạng thái trong DB giữ nguyên', async (to, _reason) => {
    const id = await newOrder();
    await expect(orders.changeStatus(id, to)).rejects.toBeInstanceOf(
      InvalidOrderTransitionException,
    );
    expect(await statusOf(id)).toBe(OrderStatus.PENDING);
  });

  it.each([OrderStatus.PAID, OrderStatus.PAYMENT_FAILED, OrderStatus.PENDING])(
    'changeStatus không được đặt %s (chỉ thanh toán mới được), trả 400',
    async (to) => {
      const id = await newOrder();
      await expect(orders.changeStatus(id, to)).rejects.toMatchObject({ status: 400 });
      expect(await statusOf(id)).toBe(OrderStatus.PENDING);
    },
  );

  it('chặn hủy khi đang pha và chặn mọi thay đổi sau COMPLETED', async () => {
    const id = await newOrder();
    await pay(id, 'SUCCESS');
    await orders.changeStatus(id, OrderStatus.PREPARING);
    await expect(orders.changeStatus(id, OrderStatus.CANCELLED)).rejects.toBeInstanceOf(
      InvalidOrderTransitionException,
    );
    await orders.changeStatus(id, OrderStatus.READY);
    await orders.changeStatus(id, OrderStatus.COMPLETED);
    await expect(orders.changeStatus(id, OrderStatus.CANCELLED)).rejects.toBeInstanceOf(
      InvalidOrderTransitionException,
    );
    expect(await statusOf(id)).toBe(OrderStatus.COMPLETED);
  });

  it('đơn đã hủy không thanh toán được và không mở lại được', async () => {
    const id = await newOrder();
    await orders.changeStatus(id, OrderStatus.CANCELLED);
    await expect(pay(id, 'SUCCESS')).rejects.toBeInstanceOf(InvalidOrderTransitionException);
    await expect(orders.changeStatus(id, OrderStatus.PREPARING)).rejects.toBeInstanceOf(
      InvalidOrderTransitionException,
    );
    expect(await statusOf(id)).toBe(OrderStatus.CANCELLED);
    expect(await prisma.payment.count({ where: { orderId: id } })).toBe(0);
  });

  it('hai yêu cầu đổi trạng thái đồng thời: chỉ một thành công, không ghi đè', async () => {
    const id = await newOrder();
    await pay(id, 'SUCCESS');
    const results = await Promise.allSettled([
      orders.changeStatus(id, OrderStatus.PREPARING),
      orders.changeStatus(id, OrderStatus.CANCELLED),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);
    expect(await statusOf(id)).toBe(
      (fulfilled[0] as PromiseFulfilledResult<{ status: OrderStatus }>).value.status,
    );
  });

  it('404 khi đổi trạng thái đơn không tồn tại', async () => {
    await expect(orders.changeStatus(2147483647, OrderStatus.PREPARING)).rejects.toMatchObject({
      status: 404,
    });
  });
});
