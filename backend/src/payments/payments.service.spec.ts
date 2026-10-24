import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MockPaymentDto } from './dto/mock-payment.dto';
import { PaymentsService } from './payments.service';

const KEY1 = '26c0d1fa-5f34-4e1c-9d76-ff2c8854ff01';
const KEY2 = '26c0d1fa-5f34-4e1c-9d76-ff2c8854ff02';
const dto = (key = KEY1, outcome: MockPaymentDto['outcome'] = 'SUCCESS'): MockPaymentDto => ({
  orderId: 42,
  method: 'MOCK_QR',
  outcome,
  idempotencyKey: key,
});

describe('PaymentsService — Mock Payment + Idempotency (Sprint 3 TV1)', () => {
  let service: PaymentsService;
  let order: { id: number; userId: number; total: number; status: OrderStatus };
  let attempts: Array<{ orderId: number; idempotencyKey: string; amount: number; method: string; outcome: string }>;
  let payments: Array<{ orderId: number; idempotencyKey: string; amount: number; method: string }>;
  let tx: {
    $queryRaw: jest.Mock;
    user: { update: jest.Mock };
    order: { findUniqueOrThrow: jest.Mock; update: jest.Mock };
    payment: { findUnique: jest.Mock; create: jest.Mock };
    paymentAttempt: { findUnique: jest.Mock; create: jest.Mock };
  };
  it('cộng điểm sau khi đơn PAID, dựa trên tổng thực trả', async () => {
    order.total = 63000;

    tx.user.update.mockImplementation(async () => {
      expect(order.status).toBe(OrderStatus.PAID);
      return {};
    });

    await service.mockPayment(7, dto());

    expect(tx.user.update).toHaveBeenCalledTimes(1);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: {
        loyaltyPoints: { increment: 6 },
      },
    });
  });

  it('không cộng điểm khi thanh toán thất bại hoặc replay thất bại', async () => {
    await service.mockPayment(7, dto(KEY1, 'FAILURE'));
    await service.mockPayment(7, dto(KEY1, 'FAILURE'));

    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('không cộng điểm lần hai khi replay hoặc đổi key sau PAID', async () => {
    await service.mockPayment(7, dto(KEY1));
    await service.mockPayment(7, dto(KEY1));

    await expect(service.mockPayment(7, dto(KEY2)))
      .rejects.toBeInstanceOf(ConflictException);

    expect(tx.user.update).toHaveBeenCalledTimes(1);
  });

  it('thất bại rồi thử lại thành công chỉ cộng điểm một lần', async () => {
    await service.mockPayment(7, dto(KEY1, 'FAILURE'));
    expect(tx.user.update).not.toHaveBeenCalled();

    await service.mockPayment(7, dto(KEY2, 'SUCCESS'));
    expect(tx.user.update).toHaveBeenCalledTimes(1);
  });

  beforeEach(() => {
    order = { id: 42, userId: 7, total: 65000, status: OrderStatus.PENDING };
    attempts = [];
    payments = [];
    tx = {
      user: {
        update: jest.fn().mockResolvedValue({}),
      },
      $queryRaw: jest.fn().mockImplementation(async (...params: unknown[]) => {
        // Mock the ownership check used by the tagged SQL query.
        const ids = params.slice(1) as number[];
        return ids[0] === order.id && ids[1] === order.userId ? [{ id: order.id }] : [];
      }),
      order: {
        findUniqueOrThrow: jest.fn().mockImplementation(async () => ({ ...order })),
        update: jest.fn().mockImplementation(async ({ data }: { data: { status: OrderStatus } }) => {
          order.status = data.status;
          return { ...order };
        }),
      },
      payment: {
        findUnique: jest.fn().mockImplementation(async () => payments.find(p => p.orderId === order.id) ?? null),
        create: jest.fn().mockImplementation(async ({ data }: { data: (typeof payments)[number] }) => {
          payments.push({ ...data });
          return data;
        }),
      },
      paymentAttempt: {
        findUnique: jest.fn().mockImplementation(async ({ where }: { where: { idempotencyKey: string } }) =>
          attempts.find(p => p.idempotencyKey === where.idempotencyKey) ?? null),
        create: jest.fn().mockImplementation(async ({ data }: { data: (typeof attempts)[number] }) => {
          attempts.push({ ...data });
          return data;
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation(async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as PrismaService;
    service = new PaymentsService(prisma);
  });

  it('pays successfully using amount from database, not client input', async () => {
    const result = await service.mockPayment(7, dto());
    expect(result).toMatchObject({ status: 'PAID', outcome: 'SUCCESS', amount: 65000, replayed: false });
    expect(order.status).toBe(OrderStatus.PAID);
    expect(payments).toHaveLength(1);
    expect(attempts).toHaveLength(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns the same result when a successful request is replayed', async () => {
    const first = await service.mockPayment(7, dto());
    const second = await service.mockPayment(7, dto());
    expect(second).toEqual({ ...first, replayed: true });
    expect(payments).toHaveLength(1);
    expect(attempts).toHaveLength(1);
  });

  it('records a failed attempt without charging or creating Payment', async () => {
    const result = await service.mockPayment(7, dto(KEY1, 'FAILURE'));
    expect(result.status).toBe('PAYMENT_FAILED');
    expect(payments).toHaveLength(0);
    expect(order.status).toBe(OrderStatus.PAYMENT_FAILED);
  });

  it('replays failed attempts consistently, then supports retry with NEW key', async () => {
    await service.mockPayment(7, dto(KEY1, 'FAILURE'));
    const repeated = await service.mockPayment(7, dto(KEY1, 'FAILURE'));
    expect(repeated).toMatchObject({ outcome: 'FAILURE', replayed: true });
    expect(attempts).toHaveLength(1);
    const succeeded = await service.mockPayment(7, dto(KEY2, 'SUCCESS'));
    expect(succeeded.status).toBe('PAID');
    expect(payments).toHaveLength(1);
    expect(attempts).toHaveLength(2);
  });

  it('rejects reuse of the key with different outcome or method', async () => {
    await service.mockPayment(7, dto(KEY1, 'FAILURE'));
    await expect(service.mockPayment(7, dto(KEY1, 'SUCCESS'))).rejects.toBeInstanceOf(ConflictException);
    await expect(service.mockPayment(7, { ...dto(KEY1, 'FAILURE'), method: 'MOCK_CARD' }))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a second successful payment using another key', async () => {
    await service.mockPayment(7, dto());
    await expect(service.mockPayment(7, dto(KEY2))).rejects.toBeInstanceOf(ConflictException);
    expect(payments).toHaveLength(1);
  });

  it('rejects unauthenticated owner and hides another user order', async () => {
    await expect(service.mockPayment(77, dto())).rejects.toBeInstanceOf(NotFoundException);
    expect(payments).toHaveLength(0);
  });

  it('does not pay cancelled orders', async () => {
    order.status = OrderStatus.CANCELLED;
    await expect(service.mockPayment(7, dto())).rejects.toBeInstanceOf(ConflictException);
    expect(payments).toHaveLength(0);
  });
});
