import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrdersService } from '../src/orders/orders.service';
import { PayosService } from '../src/payments/payos.service';
import { PayosGateway } from '../src/payments/payos.gateway';

describe('TV3 expiry + payment reconciliation (local PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orders: OrdersService;
  let payos: PayosService;
  let userId: number;
  let productId: number;
  let ingredientId: number;
  const gateway = { getPaymentLink: jest.fn(), cancelPaymentLink: jest.fn(), verifyWebhook: jest.fn() };
  const prior = process.env.PAYMENT_MODE;

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('TV3 tests require a local test database');
    process.env.PAYMENT_MODE = 'payos';
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PayosGateway).useValue(gateway).compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService); orders = app.get(OrdersService); payos = app.get(PayosService);
    userId = (await prisma.user.create({ data: { email: 'tv3-' + randomUUID() + '@test.local', passwordHash: 'test' } })).id;
    const ingredient = await prisma.ingredient.create({ data: { code: 'TV3_' + randomUUID(), name: 'TV3 coffee ' + randomUUID(), unit: 'G', stock: 100 } });
    ingredientId = ingredient.id;
    productId = (await prisma.product.create({ data: {
      name: 'Cà phê sữa TV3', price: 35000, imageUrl: 'https://placehold.co/100', stock: 100,
      sizes: [{ name: 'S', price: 0 }], toppings: [],
      ingredients: { create: [{ ingredientId, quantity: 10, size: 'S' }] },
    } })).id;
  }, 30000);

  afterAll(async () => {
    if (prisma && userId) await prisma.order.deleteMany({ where: { userId } });
    if (prisma && productId) { await prisma.productIngredient.deleteMany({ where: { productId } }); await prisma.product.delete({ where: { id: productId } }); }
    if (prisma && ingredientId) await prisma.ingredient.delete({ where: { id: ingredientId } });
    if (prisma && userId) await prisma.user.delete({ where: { id: userId } });
    await app?.close();
    if (prior === undefined) delete process.env.PAYMENT_MODE; else process.env.PAYMENT_MODE = prior;
  });

  const create = async () => {
    const order = await orders.createPending(userId, { items: [{ productId, size: 'S', quantity: 1, toppings: [] }] });
    await prisma.order.update({ where: { id: order.id }, data: { createdAt: new Date(Date.now() - 86400000) } });
    return order;
  };
  const stock = async () => Number((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredientId } })).stock);

  it('snapshots drink names and restores ingredients once under concurrent expiry', async () => {
    const before = await stock();
    const order = await create();
    expect(await stock()).toBe(before - 10);
    await prisma.product.update({ where: { id: productId }, data: { name: 'Tên mới' } });
    expect((await orders.findOwnedOrder(userId, order.id)).items[0].productName).toBe('Cà phê sữa TV3');
    const results = await Promise.all([orders.expireUnpaidOrder(order.id), orders.expireUnpaidOrder(order.id)]);
    expect(results.sort()).toEqual([false, true]);
    expect(await stock()).toBe(before);
  });

  it('never releases external checkout stock without provider confirmation', async () => {
    const order = await create();
    await prisma.payosCheckout.create({ data: { orderId: order.id, orderCode: 260000000 + order.id, amount: order.total, paymentLinkId: 'tv3-' + order.id, status: 'PENDING' } });
    const before = await stock();
    await expect(orders.expireUnpaidOrder(order.id)).rejects.toThrow();
    expect(await stock()).toBe(before);
    await orders.expireUnpaidOrder(order.id, 'EXPIRED');
    expect(await stock()).toBe(before + 10);
  });

  it('concurrent sync and signed webhook create one payment and one points award', async () => {
    const order = await create();
    const linkId = 'tv3-link-' + order.id;
    const code = 260000000 + order.id;
    await prisma.payosCheckout.create({ data: { orderId: order.id, orderCode: code, amount: order.total, paymentLinkId: linkId, status: 'PENDING' } });
    gateway.getPaymentLink.mockResolvedValue({ id: linkId, amount: order.total, amountPaid: order.total, status: 'PAID' });
    gateway.verifyWebhook.mockReturnValue({ orderCode: code, amount: order.total, paymentLinkId: linkId, reference: 'tv3-bank-' + order.id, success: true });
    const beforeStock = await stock();
    const beforePoints = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).loyaltyPoints;
    await Promise.all([payos.syncOrder(order.id), payos.webhook({}), payos.webhook({})]);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
    expect(await prisma.paymentAttempt.count({ where: { orderId: order.id, outcome: 'SUCCESS' } })).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).loyaltyPoints).toBe(beforePoints + 3);
    expect(await orders.expireUnpaidOrder(order.id, 'EXPIRED')).toBe(false);
    expect(await stock()).toBe(beforeStock);
  });
});
