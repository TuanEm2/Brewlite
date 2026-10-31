import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
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
    payosCheckout: { update: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
  };
  const prisma = {
    order: { findUnique: jest.fn(async () => order), findFirst: jest.fn(async () => order), findFirstOrThrow: jest.fn(async () => order) },
    payosCheckout: { findUnique: jest.fn(async () => checkout), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const pending = { id: 'link-1', status: 'PENDING', amount: 35000, amountPaid: 0 };
  const gateway = { assertConfigured: jest.fn(), createPaymentLink: jest.fn(), getPaymentLink: jest.fn(async () => pending), cancelPaymentLink: jest.fn().mockResolvedValue(undefined), verifyWebhook: jest.fn() };
  const orders = { expireUnpaidOrder: jest.fn().mockResolvedValue(true) };
  const service = new PayosService(prisma as unknown as PrismaService, gateway as unknown as PayosGateway, orders as unknown as OrdersService);
  return { service, prisma, gateway, orders, order, checkout, tx, pending };
}

describe('TV3 payOS reconciliation', () => {
  const prior = process.env.PAYMENT_MODE;
  beforeEach(() => { process.env.PAYMENT_MODE = 'payos'; });
  afterEach(() => jest.restoreAllMocks());
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
    await expect(f.service.status(7, 1)).rejects.toThrow('timeout');
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
  it('retries after cooldown and clears the prior sync error on success', async () => {
    const f = fixture(false);
    let now = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    f.gateway.getPaymentLink.mockRejectedValueOnce(new ServiceUnavailableException('timeout'));
    await expect(f.service.status(7, 1)).rejects.toThrow('timeout');
    now += 10_001;
    await expect(f.service.status(7, 1)).resolves.toMatchObject({ status: 'PENDING' });
    await expect(f.service.status(7, 1)).resolves.toMatchObject({ status: 'PENDING' });
    expect(f.gateway.getPaymentLink).toHaveBeenCalledTimes(2);
  });

  it('shows payment completed by webhook even during a failed-sync cooldown', async () => {
    const f = fixture(false);
    f.gateway.getPaymentLink.mockRejectedValue(new ServiceUnavailableException('timeout'));
    await expect(f.service.status(7, 1)).rejects.toThrow('timeout');
    f.gateway.verifyWebhook.mockReturnValue({ success: true, orderCode: 260000001, amount: 35000, paymentLinkId: 'link-1', reference: 'bank-ref' });
    await f.service.webhook({});
    await expect(f.service.status(7, 1)).resolves.toMatchObject({ status: 'PAID' });
    expect(f.gateway.getPaymentLink).toHaveBeenCalledTimes(1);
    expect(f.tx.payment.create).toHaveBeenCalledTimes(1);
  });

  it('does not reserve CREATING when local provider configuration is missing', async () => {
    const f = fixture(false);
    f.order.payosCheckout = null as any;
    const previousReturnUrl = process.env.PAYOS_RETURN_BASE_URL;
    process.env.PAYOS_RETURN_BASE_URL = 'https://example.test';
    f.gateway.assertConfigured.mockImplementation(() => { throw new ServiceUnavailableException('Missing config'); });
    try {
      await expect(f.service.createLink(7, 1)).rejects.toThrow('Missing config');
      expect(f.tx.payosCheckout.create).not.toHaveBeenCalled();
      expect(f.gateway.createPaymentLink).not.toHaveBeenCalled();
      expect(f.orders.expireUnpaidOrder).not.toHaveBeenCalled();
      // Correcting the configuration lets the same order create its first link.
      f.gateway.assertConfigured.mockReset();
      f.tx.payosCheckout.create.mockResolvedValue({ ...f.checkout, status: 'CREATING', checkoutUrl: null });
      f.gateway.createPaymentLink.mockResolvedValue({ paymentLinkId: 'link-1', checkoutUrl: 'https://pay.payos.vn/web/link-1' });
      await expect(f.service.createLink(7, 1)).resolves.toMatchObject({ status: 'PENDING' });
      expect(f.tx.payosCheckout.create).toHaveBeenCalledTimes(1);
      expect(f.gateway.createPaymentLink).toHaveBeenCalledTimes(1);
    } finally {
      if (previousReturnUrl === undefined) delete process.env.PAYOS_RETURN_BASE_URL;
      else process.env.PAYOS_RETURN_BASE_URL = previousReturnUrl;
    }
  });

});
