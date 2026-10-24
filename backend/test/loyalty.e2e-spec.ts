import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ConflictException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaymentsService } from '../src/payments/payments.service';
import { MockPaymentDto } from '../src/payments/dto/mock-payment.dto';

describe('Loyalty — PostgreSQL integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let payments: PaymentsService;
  let userId: number | undefined;
  let orderId: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    payments = app.get(PaymentsService);
  });

  beforeEach(async () => {
    userId = undefined;

    const user = await prisma.user.create({
      data: {
        email: `loyalty-${randomUUID()}@example.com`,
        passwordHash: 'test-fixture-not-for-login',
        loyaltyPoints: 10,
      },
    });
    userId = user.id;

    // Tạo trực tiếp đơn thử để tập trung kiểm tra thanh toán/điểm.
    const order = await prisma.order.create({
      data: {
        userId,
        status: 'PENDING',
        total: 63000,
        discount: 7000,
        voucherCode: 'BREW10',
      },
    });
    orderId = order.id;
  });

  afterEach(async () => {
    if (userId !== undefined) {
      // Quan hệ onDelete: Cascade dọn Payment và PaymentAttempt.
      await prisma.order.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  function pay(
    key: string,
    outcome: MockPaymentDto['outcome'] = 'SUCCESS',
  ) {
    return payments.mockPayment(userId!, {
      orderId,
      method: 'MOCK_QR',
      outcome,
      idempotencyKey: key,
    });
  }

  async function points() {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId! },
    });
    return user.loyaltyPoints;
  }

  async function expectPaidOnce() {
    expect(await points()).toBe(16);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(order.status).toBe('PAID');

    expect(await prisma.payment.count({
      where: { orderId },
    })).toBe(1);

    const payment = await prisma.payment.findUniqueOrThrow({
      where: { orderId },
    });
    expect(payment.amount).toBe(63000);
  }

  it('PENDING và thanh toán thất bại không cộng; thử lại thành công mới cộng', async () => {
    expect(await points()).toBe(10);

    const failedKey = randomUUID();
    await pay(failedKey, 'FAILURE');
    await pay(failedKey, 'FAILURE');
    expect(await points()).toBe(10);

    await pay(randomUUID());
    await expectPaidOnce();
  });

  it('replay cùng key không cộng điểm lần hai', async () => {
    const key = randomUUID();

    await pay(key);
    const replay = await pay(key);

    expect(replay.replayed).toBe(true);
    await expectPaidOnce();
  });

  it('hai yêu cầu đồng thời cùng key chỉ cộng điểm một lần', async () => {
    const key = randomUUID();

    // allSettled đợi cả hai kết thúc trước khi kiểm tra/dọn dữ liệu.
    const results = await Promise.allSettled([
      pay(key),
      pay(key),
    ]);

    expect(results.every((result) =>
      result.status === 'fulfilled',
    )).toBe(true);

    const replayFlags = results.map((result) =>
      result.status === 'fulfilled' ? result.value.replayed : null,
    );
    expect(replayFlags).toEqual(expect.arrayContaining([false, true]));

    await expectPaidOnce();
  });

  it('hai key khác nhau thanh toán cùng đơn: một thành công, một bị chặn', async () => {
    const results = await Promise.allSettled([
      pay(randomUUID()),
      pay(randomUUID()),
    ]);

    expect(results.filter((result) =>
      result.status === 'fulfilled',
    )).toHaveLength(1);

    const rejected = results.filter((result) =>
      result.status === 'rejected',
    );
    expect(rejected).toHaveLength(1);

    for (const result of rejected) {
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(ConflictException);
      }
    }

    await expectPaidOnce();
  });
});