import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { OrderStatus } from '@prisma/client';
import { createHmac } from 'node:crypto';
import * as request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { applyVoucher } from '../orders/voucher';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PayosService } from './payos.service';
import { PayosGateway } from './payos.gateway';

// HTTP integration with real controller, guard, JWT, DTO and signature verification.
// Prisma is an in-memory double: NOT proof of PostgreSQL rollback or row locking.
describe('TV5 payOS security (HTTP, mocked persistence)', () => {
  const secret = 'tv5-local-test-jwt-secret-at-least-32-bytes';
  const checksum = 'tv5-test-checksum-not-a-merchant-key';
  const env = {
    PAYMENT_MODE: 'payos', PAYOS_CLIENT_ID: 'test-client', PAYOS_API_KEY: 'test-api',
    PAYOS_CHECKSUM_KEY: checksum, PAYOS_RETURN_BASE_URL: 'https://example.test',
    PAYOS_ORDER_CODE_PREFIX: '260000000',
  };
  const oldEnv = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  let app: INestApplication;
  let jwt: JwtService;
  let token: string;
  let order: { id: number; userId: number; total: number; status: OrderStatus };
  let checkout: Record<string, unknown> | null;
  let payment: Record<string, unknown> | null;
  let points: number;
  const mockPayment = jest.fn();
  const prisma = {
    $transaction: jest.fn(), $queryRaw: jest.fn(),
    order: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
    payosCheckout: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    payment: { findUnique: jest.fn(), create: jest.fn() },
    paymentAttempt: { create: jest.fn() }, user: { update: jest.fn() },
  };
  // Only outbound provider calls are replaced. verifyWebhook remains production code.
  const gateway = new PayosGateway();
  let createLink: jest.SpyInstance;
  let getLink: jest.SpyInstance;
  let fetchSpy: jest.SpyInstance;

  function payload(overrides: Record<string, unknown> = {}) {
    const data = {
      amount: 63000, code: '00', currency: 'VND', orderCode: 260000042,
      paymentLinkId: 'test-link', reference: 'test-reference', ...overrides,
    };
    // Independent canonicalization for this scalar fixture (not the production helper).
    const canonical = Object.keys(data).sort().map(k =>
      `${k}=${(data as Record<string, unknown>)[k]}`).join('&');
    return { code: '00', success: true, data,
      signature: createHmac('sha256', checksum).update(canonical).digest('hex') };
  }
  function noSettlement() {
    expect(order.status).toBe(OrderStatus.PENDING);
    expect(points).toBe(0);
    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(prisma.paymentAttempt.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.order.update).not.toHaveBeenCalled();
  }
  beforeAll(async () => {
    Object.assign(process.env, env);
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('External network forbidden in TV5 tests'));
    createLink = jest.spyOn(gateway, 'createPaymentLink');
    getLink = jest.spyOn(gateway, 'getPaymentLink');
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret, signOptions: { algorithm: 'HS256', expiresIn: '1h' },
        verifyOptions: { algorithms: ['HS256'] } })],
      controllers: [PaymentsController],
      providers: [PayosService, JwtAuthGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: PayosGateway, useValue: gateway },
        { provide: PaymentsService, useValue: { mockPayment } }],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    jwt = module.get(JwtService);
    token = jwt.sign({ sub: 7, email: 'owner@example.test' });
  });
  beforeEach(() => {
    jest.clearAllMocks();
    order = { id: 42, userId: 7, total: applyVoucher(70000, 'BREW10').total, status: OrderStatus.PENDING };
    checkout = { orderId: 42, orderCode: 260000042, amount: 63000,
      paymentLinkId: 'test-link', checkoutUrl: 'https://pay.payos.vn/web/test-link', status: 'PENDING' };
    payment = null; points = 0;
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
    prisma.$queryRaw.mockImplementation(async (_sql: unknown, id: number, userId?: number) =>
      id === order.id && (userId === undefined || userId === order.userId) ? [{ id }] : []);
    prisma.order.findFirst.mockImplementation(async ({ where }) =>
      where.id === order.id && where.userId === order.userId ? { ...order, payosCheckout: checkout } : null);
    prisma.order.findUniqueOrThrow.mockImplementation(async () => ({ ...order }));
    prisma.order.update.mockImplementation(async ({ data }) => Object.assign(order, data));
    prisma.payosCheckout.findUnique.mockImplementation(async ({ where }) =>
      checkout && (where.orderId === 42 || where.orderCode === 260000042) ? { ...checkout } : null);
    prisma.payosCheckout.create.mockImplementation(async ({ data }) => {
      checkout = { ...data, status: 'CREATING' }; return { ...checkout };
    });
    prisma.payosCheckout.update.mockImplementation(async ({ data }) => Object.assign(checkout!, data));
    prisma.payosCheckout.updateMany.mockImplementation(async ({ data }) => {
      Object.assign(checkout!, data); return { count: 1 };
    });
    prisma.payment.findUnique.mockImplementation(async () => payment);
    prisma.payment.create.mockImplementation(async ({ data }) => { payment = data; return data; });
    prisma.paymentAttempt.create.mockImplementation(async ({ data }) => data);
    prisma.user.update.mockImplementation(async ({ data }) => {
      points += data.loyaltyPoints.increment; return { loyaltyPoints: points };
    });
    createLink.mockResolvedValue({ orderCode: 260000042, amount: 63000,
      paymentLinkId: 'test-link', checkoutUrl: 'https://pay.payos.vn/web/test-link' });
    getLink.mockRejectedValue(new Error('Unexpected provider recovery call'));
  });
  afterEach(() => { expect(fetchSpy).not.toHaveBeenCalled(); });
  afterAll(async () => {
    await app?.close(); jest.restoreAllMocks();
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  for (const prefix of ['/payments', '/api/payments']) {
    it.each(['missing', 'malformed', 'wrong-signature', 'expired'])(`${prefix}: rejects %s JWT before persistence`, async kind => {
      const bad = kind === 'expired' ? jwt.sign({ sub: 7 }, { expiresIn: -1 })
        : kind === 'wrong-signature' ? new JwtService({ secret: 'wrong-test-key' }).sign({ sub: 7 }) : 'not-a-jwt';
      for (const method of ['create', 'status']) {
        let call = method === 'create'
          ? request(app.getHttpServer()).post(`${prefix}/payos/create`).send({ orderId: 42 })
          : request(app.getHttpServer()).get(`${prefix}/payos/status/42`);
        if (kind !== 'missing') call = call.set('Authorization', `Bearer ${bad}`);
        await call.expect(401);
      }
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.order.findFirst).not.toHaveBeenCalled(); noSettlement();
    });
    it(`${prefix}: another user cannot create a link or read order status`, async () => {
      const other = jwt.sign({ sub: 8, email: 'other@example.test' });
      await request(app.getHttpServer()).post(`${prefix}/payos/create`)
        .set('Authorization', `Bearer ${other}`).send({ orderId: 42 }).expect(404);
      await request(app.getHttpServer()).get(`${prefix}/payos/status/42`)
        .set('Authorization', `Bearer ${other}`).expect(404);
      expect(createLink).not.toHaveBeenCalled(); expect(getLink).not.toHaveBeenCalled();
      expect(prisma.payosCheckout.create).not.toHaveBeenCalled(); noSettlement();
    });
    it(`${prefix}: rejects a client-supplied price`, async () => {
      await request(app.getHttpServer()).post(`${prefix}/payos/create`)
        .set('Authorization', `Bearer ${token}`).send({ orderId: 42, amount: 1 }).expect(400);
      expect(prisma.$transaction).not.toHaveBeenCalled(); noSettlement();
    });
    it(`${prefix}: disables mock-success endpoints in payOS mode`, async () => {
      for (const suffix of ['', '/mock']) {
        await request(app.getHttpServer()).post(prefix + suffix)
          .set('Authorization', `Bearer ${token}`).send({ orderId: 42, method: 'MOCK_QR',
            outcome: 'SUCCESS', idempotencyKey: '26c0d1fa-5f34-4e1c-9d76-ff2c8854ff01' }).expect(403);
      }
      expect(mockPayment).not.toHaveBeenCalled(); noSettlement();
    });
  }
  it('creates a link for the owner using the total after BREW10, without awarding points', async () => {
    checkout = null;
    const res = await request(app.getHttpServer()).post('/payments/payos/create')
      .set('Authorization', `Bearer ${token}`).send({ orderId: 42 }).expect(201);
    expect(res.body.amount).toBe(63000);
    expect(createLink).toHaveBeenCalledWith(expect.objectContaining({ amount: 63000, orderCode: 260000042 }));
    noSettlement();
  });
  it('owner status/redirect query cannot mark the order PAID', async () => {
    const res = await request(app.getHttpServer()).get('/payments/payos/status/42?status=PAID&success=true')
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body.status).toBe('PENDING'); noSettlement();
  });
  it.each(['missing', 'fake', 'tampered-amount', 'tampered-order'])(
    'rejects %s webhook signature before reading payment data', async kind => {
      const body = payload();
      if (kind === 'missing') delete (body as Partial<typeof body>).signature;
      if (kind === 'fake') body.signature = '0'.repeat(64);
      if (kind === 'tampered-amount') body.data.amount = 1;
      if (kind === 'tampered-order') body.data.orderCode++;
      await request(app.getHttpServer()).post('/payments/payos/webhook').send(body).expect(400);
      expect(prisma.payosCheckout.findUnique).not.toHaveBeenCalled(); noSettlement();
    });
  it.each([{ amount: 1 }, { paymentLinkId: 'different-link' }, { reference: ' ' }])(
    'rejects a correctly signed but inconsistent event %j', async changes => {
      await request(app.getHttpServer()).post('/payments/payos/webhook').send(payload(changes)).expect(400);
      noSettlement();
    });
  it('ignores a signed failure without settlement', async () => {
    await request(app.getHttpServer()).post('/payments/payos/webhook')
      .send({ ...payload(), success: false }).expect(200);
    noSettlement();
  });
  it('accepts a valid webhook without user JWT and awards six points only once across aliases', async () => {
    await request(app.getHttpServer()).post('/payments/payos/webhook').send(payload()).expect(200);
    const replay = await request(app.getHttpServer()).post('/api/payments/payos/webhook').send(payload()).expect(200);
    expect(replay.body.replayed).toBe(true);
    expect(order.status).toBe(OrderStatus.PAID); expect(points).toBe(6);
    expect(prisma.payment.create).toHaveBeenCalledTimes(1);
    expect(prisma.paymentAttempt.create).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(payment).toMatchObject({ orderId: 42, amount: 63000 });
  });
  it('does not award points again for a different bank reference on a paid order', async () => {
    await request(app.getHttpServer()).post('/payments/payos/webhook').send(payload()).expect(200);
    await request(app.getHttpServer()).post('/payments/payos/webhook')
      .send(payload({ reference: 'second-bank-reference' })).expect(409);
    expect(points).toBe(6); expect(prisma.payment.create).toHaveBeenCalledTimes(1);
  });
});
