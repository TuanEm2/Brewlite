import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PayosService } from './payos.service';
import { PayosGateway } from './payos.gateway';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';

function fixture(overdue = true) {
  const checkout = { orderId: 1, orderCode: 260000001, amount: 35000, paymentLinkId: 'link-1', status: 'PENDING', createdAt: new Date(0) };
  const order = { id: 1, userId: 7, status: OrderStatus.PENDING as OrderStatus, total: 35000,
    createdAt: new Date(Date.now() - (overdue ? 86400000 : 0)), payosCheckout: checkout, items: [] };
  let previous: unknown = null;
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 1 }]),
    order: {
      findUniqueOrThrow: jest.fn(async () => order),
      update: jest.fn(async ({ data }: any) => Object.assign(order, data)),
    },
    payment: { findUnique: jest.fn(async () => previous), create: jest.fn(async ({ data }: any) => { previous = data; return data; }) },
    paymentAttempt: { create: jest.fn().mockResolvedValue({}) },
    user: { update: jest.fn().mockResolvedValue({}) },
    payosCheckout: { update: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    order: { findUnique: jest.fn(async () => order), findFirst: jest.fn(async () => order), findFirstOrThrow: jest.fn(async () => order) },
    payosCheckout: { findUnique: jest.fn(async () => checkout) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const pending = { id: 'link-1', status: 'PENDING', amount: 35000, amountPaid: 0 };
  const gateway = { getPaymentLink: jest.fn(async () => pending), cancelPaymentLink: jest.fn().mockResolvedValue(undefined), verifyWebhook: jest.fn() };
  const orders = { expireUnpaidOrder: jest.fn().mockResolvedValue(true) };
  const service = new PayosService(prisma as unknown as PrismaService, gateway as unknown as PayosGateway, orders as unknown as OrdersService);
  return { service, prisma, gateway, orders, order, checkout, tx, pending };
}

describe('TV3 payOS reconciliation', () => {
  const prior = process.env.PAYMENT_MODE;
  beforeEach(() => { process.env.PAYMENT_MODE = 'payos'; });
  afterAll(() => { if (prior === undefined) delete process.env.PAYMENT_MODE; else process.env.PAYMENT_MODE = prior; });

  it('cancels overdue pending link, rechecks provider, then releases stock', async () => {
    const f = fixture();
    f.gateway.getPaymentLink.mockResolvedValueOnce(f.pending).mockResolvedValueOnce({ ...f.pending, status: 'CANCELLED' });
    await f.service.syncOrder(1);
    expect(f.gateway.cancelPaymentLink).toHaveBeenCalledWith(260000001);
    expect(f.gateway.getPaymentLink).toHaveBeenCalledTimes(2);
    expect(f.orders.expireUnpaidOrder).toHaveBeenCalledWith(1, 'CANCELLED');
    expect(f.tx.payment.create).not.toHaveBeenCalled();
  });

  it('records payment instead of expiring when payment wins cancellation race', async () => {
    const f = fixture();
    f.gateway.getPaymentLink.mockResolvedValueOnce(f.pending).mockResolvedValueOnce({ ...f.pending, status: 'PAID', amountPaid: 35000 });
    await f.service.syncOrder(1);
    expect(f.orders.expireUnpaidOrder).not.toHaveBeenCalled();
    expect(f.tx.payment.create).toHaveBeenCalledTimes(1);
    expect(f.order.status).toBe(OrderStatus.PAID);
    expect(f.tx.user.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { loyaltyPoints: { increment: 3 } } });
    // A later signed webhook for the same checkout cannot duplicate payment/points.
    f.gateway.verifyWebhook.mockReturnValue({ success: true, orderCode: 260000001, amount: 35000, paymentLinkId: 'link-1', reference: 'bank-ref' });
    expect(await f.service.webhook({})).toEqual({ received: true, replayed: true });
    expect(f.tx.payment.create).toHaveBeenCalledTimes(1);
    expect(f.tx.user.update).toHaveBeenCalledTimes(1);
  });

  it.each(['CANCELLED', 'EXPIRED'])('expires a provider-confirmed %s link before local TTL', async status => {
    const f = fixture(false);
    f.gateway.getPaymentLink.mockResolvedValue({ ...f.pending, status });
    await f.service.syncOrder(1);
    expect(f.orders.expireUnpaidOrder).toHaveBeenCalledWith(1, status);
  });

  it('keeps stock and order on network timeout and throttles subsequent polling', async () => {
    const f = fixture();
    f.gateway.getPaymentLink.mockRejectedValue(new Error('timeout'));
    await expect(f.service.syncOrder(1)).rejects.toThrow('timeout');
    await f.service.syncOrder(1);
    expect(f.gateway.getPaymentLink).toHaveBeenCalledTimes(1);
    expect(f.orders.expireUnpaidOrder).not.toHaveBeenCalled();
  });

  it('never releases stock if cancellation cannot be confirmed', async () => {
    const f = fixture();
    f.gateway.cancelPaymentLink.mockRejectedValue(new Error('timeout'));
    await expect(f.service.syncOrder(1)).rejects.toThrow('timeout');
    expect(f.orders.expireUnpaidOrder).not.toHaveBeenCalled();
  });

  it('does not cancel a partially paid overdue link', async () => {
    const f = fixture();
    f.gateway.getPaymentLink.mockResolvedValue({ ...f.pending, amountPaid: 10000 });
    await expect(f.service.syncOrder(1)).rejects.toThrow(ConflictException);
    expect(f.gateway.cancelPaymentLink).not.toHaveBeenCalled();
    expect(f.orders.expireUnpaidOrder).not.toHaveBeenCalled();
  });

  it('rejects amount or link mismatch before cancellation', async () => {
    const f = fixture();
    f.gateway.getPaymentLink.mockResolvedValue({ ...f.pending, id: 'another-link' });
    await expect(f.service.syncOrder(1)).rejects.toThrow(ConflictException);
    expect(f.gateway.cancelPaymentLink).not.toHaveBeenCalled();
  });

  it('does not disclose or query provider for another user order', async () => {
    const f = fixture();
    f.prisma.order.findFirst.mockResolvedValue(null as any);
    await expect(f.service.status(999, 1)).rejects.toThrow(NotFoundException);
    expect(f.gateway.getPaymentLink).not.toHaveBeenCalled();
  });

  it('coalesces concurrent polling and worker calls', async () => {
    const f = fixture(false);
    await Promise.all([f.service.syncOrder(1), f.service.syncOrder(1), f.service.syncOrder(1)]);
    expect(f.gateway.getPaymentLink).toHaveBeenCalledTimes(1);
  });

  it('expires overdue orders without an external link', async () => {
    const f = fixture();
    f.order.payosCheckout = null as any;
    await f.service.syncOrder(1);
    expect(f.orders.expireUnpaidOrder).toHaveBeenCalledWith(1);
    expect(f.gateway.getPaymentLink).not.toHaveBeenCalled();
  });

  it('opening checkout triggers synchronization', async () => {
    const f = fixture(false);
    await f.service.status(7, 1);
    expect(f.gateway.getPaymentLink).toHaveBeenCalledTimes(1);
  });
});
