import 'dotenv/config';
import { createHmac, randomUUID } from 'node:crypto';
import { INestApplication, ServiceUnavailableException, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PayosGateway } from '../src/payments/payos.gateway';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * TV6 acceptance E2E: real controller, signed webhook, PostgreSQL test database.
 * Provider's outbound API is stubbed; NEVER sends real money or uses merchant keys.
 */
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error('TV6 requires a dedicated TEST database');
const db = new URL(dbUrl);
if (!['localhost', '127.0.0.1', '[::1]'].includes(db.hostname) ||
    !(['/brewlite_tv06_payos_test'].includes(db.pathname) ||
      (process.env.GITHUB_ACTIONS === 'true' && db.pathname === '/brewlite_test'))) {
  throw new Error('TV6 E2E refuses to run against a non-test / remote database');
}
jest.setTimeout(60000);

type ProviderLink = { id: string; amount: number; status: string; amountPaid: number };

describe('TV6 — payOS acceptance, error paths and idempotency', () => {
  const key = 'tv6-test-checksum-not-a-real-key';
  const env = {
    PAYMENT_MODE: 'payos', PAYOS_CLIENT_ID: 'tv6-test-client',
    PAYOS_API_KEY: 'tv6-test-key', PAYOS_CHECKSUM_KEY: key,
    PAYOS_ORDER_CODE_PREFIX: '260000000',
    PAYOS_RETURN_BASE_URL: 'https://example.test',
    JWT_SECRET: 'tv6-test-secret-must-be-at-least-32-characters',
    ORDER_EXPIRY_WORKER_ENABLED: 'false',
  };
  const old = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  const provider = new Map<number, ProviderLink>();
  const gateway = new PayosGateway();
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let fetchSpy: jest.SpyInstance;
  let createSpy: jest.SpyInstance;
  let statusSpy: jest.SpyInstance;
  let userId: number;
  let strangerId: number;
  let productId: number;
  let ingredientId: number;
  let token: string;
  let strangerToken: string;

  function signed(orderId: number, amount: number, link: string, success = true) {
    const data: Record<string, string | number> = {
      amount, code: '00', currency: 'VND',
      orderCode: 260000000 + orderId, paymentLinkId: link,
      reference: 'TV6_' + randomUUID().replace(/-/g, ''),
    };
    const canonical = Object.keys(data).sort().map(k => k + '=' + data[k]).join('&');
    return { code: '00', success, data,
      signature: createHmac('sha256', key).update(canonical).digest('hex') };
  }

  async function order() {
    const response = await request(app.getHttpServer()).post('/orders')
      .set('Authorization', 'Bearer ' + token)
      .send({ idempotencyKey: randomUUID(),
        items: [{ productId, size: 'S', toppings: [], quantity: 1 }] });
    expect(response.status).toBe(201);
    expect(response.body.status).toBe('PENDING');
    expect(response.body.total).toBe(30000);
    return response.body.id as number;
  }
  async function checkout(orderId: number) {
    const response = await request(app.getHttpServer()).post('/payments/payos/create')
      .set('Authorization', 'Bearer ' + token).send({ orderId }).expect(201);
    expect(response.body.amount).toBe(30000);
    expect(response.body.checkoutUrl).toBe('https://pay.payos.vn/web/tv6-' + (260000000 + orderId));
    return provider.get(260000000 + orderId)!.id;
  }
  async function snapshot(orderId: number) {
    const saved = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return { status: saved.status, payment: await prisma.payment.count({ where: { orderId } }),
      attempts: await prisma.paymentAttempt.count({ where: { orderId } }), points: u.loyaltyPoints };
  }

  beforeAll(async () => {
    Object.assign(process.env, env);
    fetchSpy = jest.spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('External payOS API calls forbidden in TV6 tests'));
    createSpy = jest.spyOn(gateway, 'createPaymentLink').mockImplementation(async p => {
      const id = 'tv6-' + p.orderCode;
      provider.set(p.orderCode, { id, amount: p.amount, amountPaid: 0, status: 'PENDING' });
      return { orderCode: p.orderCode, amount: p.amount, paymentLinkId: id,
        checkoutUrl: 'https://pay.payos.vn/web/' + id };
    });
    statusSpy = jest.spyOn(gateway, 'getPaymentLink').mockImplementation(async code => {
      const link = provider.get(code);
      if (!link) throw new ServiceUnavailableException('No test link');
      return link;
    });
    const mod = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PayosGateway).useValue(gateway).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true, forbidNonWhitelisted: true, transform: true,
    }));
    await app.init();
    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);
  });
  beforeEach(async () => {
    provider.clear(); createSpy.mockClear(); statusSpy.mockClear();
    const u = randomUUID();
    const owner = await prisma.user.create({ data: {
      email: 'tv6-owner-' + u + '@example.test', passwordHash: 'test-only', loyaltyPoints: 10,
    } });
    const stranger = await prisma.user.create({ data: {
      email: 'tv6-other-' + u + '@example.test', passwordHash: 'test-only',
    } });
    userId = owner.id; strangerId = stranger.id;
    token = jwt.sign({ sub: userId, email: owner.email });
    strangerToken = jwt.sign({ sub: strangerId, email: stranger.email });
    const ingredient = await prisma.ingredient.create({ data: {
      code: 'TV6_' + u, name: 'TV6 ingredient', stock: 20, unit: 'ML', version: 0,
    } });
    ingredientId = ingredient.id;
    const product = await prisma.product.create({ data: {
      name: 'TV6 drink', price: 30000, imageUrl: '/test.png', stock: 100,
      sizes: [{ name: 'S', price: 0 }], toppings: [],
      ingredients: { create: [{ ingredientId, quantity: 1, size: 'S', topping: '' }] },
    } });
    productId = product.id;
  });
  afterEach(async () => {
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockClear();
    await prisma.order.deleteMany({ where: { userId } });
    await prisma.productIngredient.deleteMany({ where: { productId } });
    await prisma.product.delete({ where: { id: productId } });
    await prisma.ingredient.delete({ where: { id: ingredientId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, strangerId] } } });
    provider.clear();
  });
  afterAll(async () => {
    try { await app?.close(); }
    finally {
      jest.restoreAllMocks();
      for (const [k, v] of Object.entries(old)) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    }
  });

  it('TV6-01: Order → payOS → signed webhook → PAID and order history', async () => {
    const id = await order();
    const link = await checkout(id);
    await request(app.getHttpServer()).post('/payments/payos/webhook')
      .send(signed(id, 30000, link)).expect(200);
    const result = await request(app.getHttpServer()).get('/payments/payos/status/' + id)
      .set('Authorization', 'Bearer ' + token).expect(200);
    expect(result.body.status).toBe('PAID');
    const history = await request(app.getHttpServer()).get('/orders/me')
      .set('Authorization', 'Bearer ' + token).expect(200);
    expect(history.body).toEqual(expect.arrayContaining([expect.objectContaining({ id, status: 'PAID' })]));
    expect(await snapshot(id)).toEqual({ status: 'PAID', payment: 1, attempts: 1, points: 13 });
  });
  it('TV6-02: failed and forged webhook never settle an order', async () => {
    const id = await order(), link = await checkout(id);
    const payload = signed(id, 30000, link);
    await request(app.getHttpServer()).post('/payments/payos/webhook')
      .send({ ...payload, data: { ...payload.data, amount: 1 } }).expect(400);
    await request(app.getHttpServer()).post('/payments/payos/webhook')
      .send(signed(id, 1, link)).expect(400);
    await request(app.getHttpServer()).post('/payments/payos/webhook')
      .send({ ...payload, success: false }).expect(200);
    expect(await snapshot(id)).toEqual({ status: 'PENDING', payment: 0, attempts: 0, points: 10 });
    await request(app.getHttpServer()).post('/payments/payos/webhook').send(payload).expect(200);
    expect(await snapshot(id)).toEqual({ status: 'PAID', payment: 1, attempts: 1, points: 13 });
  });
  it('TV6-03: four concurrent webhooks do not duplicate money records or points', async () => {
    const id = await order(), link = await checkout(id), payload = signed(id, 30000, link);
    const responses = await Promise.all(Array.from({ length: 4 },
      () => request(app.getHttpServer()).post('/payments/payos/webhook').send(payload)));
    expect(responses.map(r => r.status)).toEqual([200, 200, 200, 200]);
    expect(responses.filter(r => r.body.replayed === false)).toHaveLength(1);
    expect(await snapshot(id)).toEqual({ status: 'PAID', payment: 1, attempts: 1, points: 13 });
    await request(app.getHttpServer()).post('/api/payments/payos/webhook').send(payload).expect(200);
    expect(await snapshot(id)).toEqual({ status: 'PAID', payment: 1, attempts: 1, points: 13 });
  });
  it('TV6-04: provider timeout is not evidence of payment failure', async () => {
    const id = await order(), link = await checkout(id);
    statusSpy.mockRejectedValueOnce(new ServiceUnavailableException('Test provider timeout'));
    const response = await request(app.getHttpServer()).get('/payments/payos/status/' + id)
      .set('Authorization', 'Bearer ' + token);
    expect([200, 503]).toContain(response.status);
    expect(await snapshot(id)).toEqual({ status: 'PENDING', payment: 0, attempts: 0, points: 10 });
    await request(app.getHttpServer()).post('/payments/payos/webhook')
      .send(signed(id, 30000, link)).expect(200);
    expect(await snapshot(id)).toEqual({ status: 'PAID', payment: 1, attempts: 1, points: 13 });
  });
  it('TV6-05: authentication, ownership, amount tampering are rejected', async () => {
    const id = await order();
    await request(app.getHttpServer()).post('/payments/payos/create').send({ orderId: id }).expect(401);
    await request(app.getHttpServer()).post('/payments/payos/create')
      .set('Authorization', 'Bearer ' + strangerToken).send({ orderId: id }).expect(404);
    await request(app.getHttpServer()).get('/payments/payos/status/' + id)
      .set('Authorization', 'Bearer ' + strangerToken).expect(404);
    await request(app.getHttpServer()).post('/payments/payos/create')
      .set('Authorization', 'Bearer ' + token).send({ orderId: id, amount: 1 }).expect(400);
    expect(createSpy).not.toHaveBeenCalled();
    expect(await snapshot(id)).toEqual({ status: 'PENDING', payment: 0, attempts: 0, points: 10 });
  });
  it('TV6-06: link creation outage does not mark order PAID', async () => {
    const id = await order();
    createSpy.mockRejectedValueOnce(new ServiceUnavailableException('Test provider outage'));
    await request(app.getHttpServer()).post('/payments/payos/create')
      .set('Authorization', 'Bearer ' + token).send({ orderId: id }).expect(503);
    expect(await snapshot(id)).toEqual({ status: 'PENDING', payment: 0, attempts: 0, points: 10 });
  });
});
