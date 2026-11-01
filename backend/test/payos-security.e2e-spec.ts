import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { createHmac, randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaymentsController } from '../src/payments/payments.controller';
import { PaymentsService } from '../src/payments/payments.service';
import { PayosService } from '../src/payments/payos.service';
import { PayosGateway } from '../src/payments/payos.gateway';

// Fail closed before connecting. Never execute on an application/Render database.
const dbUrl = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
if (!['localhost', '127.0.0.1', '[::1]'].includes(dbUrl.hostname) ||
    dbUrl.pathname !== '/brewlite_tv5_payos_test') {
  throw new Error('TV5 tests require local database brewlite_tv5_payos_test. Set DATABASE_URL in this shell.');
}

jest.setTimeout(30000);
describe('TV5 payOS security — PostgreSQL + HTTP', () => {
  const prisma = new PrismaClient();
  const checksum = 'tv5-postgres-test-key-not-a-real-merchant-key';
  const config = { PAYMENT_MODE: 'payos', PAYOS_CLIENT_ID: 'test-client', PAYOS_API_KEY: 'test-api',
    PAYOS_CHECKSUM_KEY: checksum, PAYOS_RETURN_BASE_URL: 'https://example.test' };
  const oldEnv = Object.fromEntries(Object.keys(config).map(k => [k, process.env[k]]));
  let app: INestApplication;
  let jwt: JwtService;
  let ownerId: number;
  let otherId: number;
  let orderId: number;
  let orderCode: number;
  let linkId: string;
  let reference: string;
  let token: string;
  let fetchSpy: jest.SpyInstance;
  const users: number[] = [];
  const orders: number[] = [];

  function event(overrides: Record<string, unknown> = {}) {
    const data: Record<string, unknown> = { amount: 63000, code: '00', currency: 'VND',
      orderCode, paymentLinkId: linkId, reference, ...overrides };
    return { code: '00', success: true, data, signature: createHmac('sha256', checksum)
      .update(Object.keys(data).sort().map(k => `${k}=${data[k]}`).join('&')).digest('hex') };
  }
  async function snapshot() {
    return {
      order: await prisma.order.findUniqueOrThrow({ where: { id: orderId } }),
      checkout: await prisma.payosCheckout.findUniqueOrThrow({ where: { orderId } }),
      payments: await prisma.payment.findMany({ where: { orderId } }),
      attempts: await prisma.paymentAttempt.findMany({ where: { orderId } }),
      owner: await prisma.user.findUniqueOrThrow({ where: { id: ownerId } }),
      other: await prisma.user.findUniqueOrThrow({ where: { id: otherId } }),
    };
  }
  beforeAll(async () => {
    Object.assign(process.env, config);
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Outbound network forbidden'));
    await prisma.$connect();
    // Real PrismaClient, without application auto-seed. Real signature verification.
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'tv5-test-jwt-secret-at-least-32-bytes',
        signOptions: { expiresIn: '1h', algorithm: 'HS256' }, verifyOptions: { algorithms: ['HS256'] } })],
      controllers: [PaymentsController],
      providers: [PayosService, PaymentsService, PayosGateway, JwtAuthGuard,
        { provide: PrismaService, useValue: prisma }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init(); jwt = module.get(JwtService);
  });
  beforeEach(async () => {
    fetchSpy.mockClear();
    const suffix = randomUUID();
    const owner = await prisma.user.create({ data: { email: `tv5-owner-${suffix}@example.test`,
      passwordHash: 'fixture-only-not-used-for-login', loyaltyPoints: 11 } });
    ownerId = owner.id; users.push(ownerId);
    const other = await prisma.user.create({ data: { email: `tv5-other-${suffix}@example.test`,
      passwordHash: 'fixture-only-not-used-for-login' } });
    otherId = other.id; users.push(otherId);
    // Saved voucher order fixture; POST /orders / recipe deduction is outside this suite.
    const order = await prisma.order.create({ data: { userId: ownerId, total: 63000,
      discount: 7000, voucherCode: 'BREW10', status: 'PENDING' } });
    orderId = order.id; orders.push(orderId); orderCode = 260000000 + orderId;
    linkId = `tv5-link-${suffix}`; reference = `tv5-ref-${suffix}`;
    await prisma.payosCheckout.create({ data: { orderId, orderCode, amount: 63000,
      paymentLinkId: linkId, checkoutUrl: `https://pay.payos.vn/web/${linkId}`, status: 'PENDING' } });
    token = jwt.sign({ sub: ownerId, email: owner.email });
  });
  afterEach(() => { expect(fetchSpy).not.toHaveBeenCalled(); });
  afterAll(async () => {
    try {
      // Only IDs created by this run. Never truncate/seed/reset or touch existing demo records.
      await prisma.order.deleteMany({ where: { id: { in: orders } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
    } finally {
      await app?.close(); await prisma.$disconnect(); jest.restoreAllMocks();
      for (const [k, v] of Object.entries(oldEnv)) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
    }
  });
  it.each(['missing', 'wrong-signature', 'expired'])('rejects %s JWT without changing DB', async kind => {
    const before = await snapshot();
    const bad = kind === 'expired' ? jwt.sign({ sub: ownerId }, { expiresIn: -1 })
      : new JwtService({ secret: 'different-key' }).sign({ sub: ownerId });
    let call = request(app.getHttpServer()).post('/payments/payos/create').send({ orderId });
    if (kind !== 'missing') call = call.set('Authorization', `Bearer ${bad}`);
    await call.expect(401); expect(await snapshot()).toEqual(before);
  });
  it('another account cannot create a link or read status (both route aliases)', async () => {
    const before = await snapshot(); const otherToken = jwt.sign({ sub: otherId });
    for (const prefix of ['/payments', '/api/payments']) {
      await request(app.getHttpServer()).post(`${prefix}/payos/create`)
        .set('Authorization', `Bearer ${otherToken}`).send({ orderId }).expect(404);
      await request(app.getHttpServer()).get(`${prefix}/payos/status/${orderId}`)
        .set('Authorization', `Bearer ${otherToken}`).expect(404);
    }
    expect(await snapshot()).toEqual(before);
  });
  it.each(['fake-signature', 'tampered-amount', 'signed-wrong-amount', 'signed-wrong-link'])(
    'rejects %s webhook and preserves DB', async kind => {
      const before = await snapshot();
      const body = event(kind === 'signed-wrong-amount' ? { amount: 1 }
        : kind === 'signed-wrong-link' ? { paymentLinkId: 'other-link' } : {});
      if (kind === 'fake-signature') body.signature = '0'.repeat(64);
      if (kind === 'tampered-amount') body.data.amount = 1;
      await request(app.getHttpServer()).post('/payments/payos/webhook').send(body).expect(400);
      expect(await snapshot()).toEqual(before);
    });
  it('signed failure does not settle or award points', async () => {
    const before = await snapshot();
    await request(app.getHttpServer()).post('/payments/payos/webhook')
      .send({ ...event(), success: false }).expect(200);
    expect(await snapshot()).toEqual(before);
  });
  it('client cannot submit its own amount or invoke mock success in payOS mode', async () => {
    const before = await snapshot();
    await request(app.getHttpServer()).post('/payments/payos/create')
      .set('Authorization', `Bearer ${token}`).send({ orderId, amount: 1 }).expect(400);
    await request(app.getHttpServer()).post('/payments/mock').set('Authorization', `Bearer ${token}`)
      .send({ orderId, method: 'MOCK_QR', outcome: 'SUCCESS', idempotencyKey: randomUUID() }).expect(403);
    expect(await snapshot()).toEqual(before);
  });
  it('concurrent valid webhooks settle once with the saved discounted total', async () => {
    const responses = await Promise.all(Array.from({ length: 4 }, () =>
      request(app.getHttpServer()).post('/payments/payos/webhook').send(event())));
    expect(responses.map(r => r.status)).toEqual([200, 200, 200, 200]);
    const after = await snapshot();
    expect(after.order.status).toBe('PAID'); expect(after.checkout.status).toBe('PAID');
    expect(after.payments).toHaveLength(1); expect(after.attempts).toHaveLength(1);
    expect(after.payments[0].amount).toBe(63000); expect(after.attempts[0].amount).toBe(63000);
    expect(after.owner.loyaltyPoints).toBe(17); expect(after.other.loyaltyPoints).toBe(0);
    await request(app.getHttpServer()).post('/api/payments/payos/webhook').send(event()).expect(200);
    expect(await snapshot()).toEqual(after);
    await request(app.getHttpServer()).post('/payments/payos/webhook')
      .send(event({ reference: `${reference}-second` })).expect(409);
    expect(await snapshot()).toEqual(after);
  });
});
