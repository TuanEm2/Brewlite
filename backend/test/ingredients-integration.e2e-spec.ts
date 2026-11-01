import 'dotenv/config';
import { createHmac, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * TV4: payOS webhook, concurrency and atomic rollback (real NestJS + PostgreSQL).
 * No merchant keys and no provider calls. All payment payloads are test fixtures.
 * SAFETY: fail closed unless DATABASE_URL points at a dedicated local test DB,
 * or the known localhost GitHub Actions CI database. Never run against Render.
 */
const rawDbUrl = process.env.DATABASE_URL;
if (!rawDbUrl) throw new Error('TV4 tests require DATABASE_URL for a test database');
const db = new URL(rawDbUrl);
const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(db.hostname);
const isTest = db.pathname === '/brewlite_tv4_payos_test' ||
  (process.env.GITHUB_ACTIONS === 'true' && db.pathname === '/brewlite_test');
if (!isLocal || !isTest) {
  throw new Error('Refusing to run TV4 E2E outside dedicated local test database');
}

jest.setTimeout(60000);

describe('TV4 - payOS signed webhook, concurrency, and transaction rollback', () => {
  const checksum = 'tv4-local-e2e-test-checksum-not-real';
  const testEnv = {
    PAYMENT_MODE: 'payos',
    PAYOS_CLIENT_ID: 'test-client-tv4',
    PAYOS_API_KEY: 'test-api-tv4',
    PAYOS_CHECKSUM_KEY: checksum,
    PAYOS_ORDER_CODE_PREFIX: '260000000',
    PAYOS_RETURN_BASE_URL: 'https://example.test',
    JWT_SECRET: 'tv4-test-jwt-secret-longer-than-32-bytes',
  };
  const previousEnv = Object.fromEntries(Object.keys(testEnv)
    .map((key) => [key, process.env[key]]));

  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let fetchSpy: jest.SpyInstance;
  let userId: number | undefined;
  let productId: number | undefined;
  let ingredientId: number | undefined;
  let token = '';

  const startStock = 2;
  const price = 30000;

  async function placeOrder(quantity: number) {
    if (productId === undefined) throw new Error('No test product');
    return request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', 'Bearer ' + token)
      .send({
        items: [{ productId, size: 'S', toppings: [], quantity }],
      });
  }

  async function stockSnapshot() {
    if (ingredientId === undefined) throw new Error('No test ingredient');
    const row = await prisma.ingredient.findUniqueOrThrow({
      where: { id: ingredientId },
    });
    return { stock: Number(row.stock), version: row.version };
  }

  async function testCheckout(orderId: number, amount: number) {
    const linkId = 'tv4-link-' + randomUUID();
    await prisma.payosCheckout.create({
      data: {
        orderId,
        orderCode: 260000000 + orderId,
        amount,
        status: 'PENDING',
        paymentLinkId: linkId,
        checkoutUrl: 'https://pay.payos.vn/web/' + linkId,
      },
    });
    return linkId;
  }

  function signedEvent(orderId: number, amount: number, linkId: string) {
    // Independent scalar-field canonicalization; use the real Gateway verifier.
    const data: Record<string, string | number> = {
      amount,
      code: '00',
      currency: 'VND',
      orderCode: 260000000 + orderId,
      paymentLinkId: linkId,
      reference: 'TV4_REF_' + randomUUID().replace(/-/g, ''),
    };
    const canonical = Object.keys(data).sort()
      .map((key) => key + '=' + String(data[key])).join('&');
    return {
      code: '00',
      success: true,
      data,
      signature: createHmac('sha256', checksum).update(canonical).digest('hex'),
    };
  }

  beforeAll(async () => {
    Object.assign(process.env, testEnv);
    // Block accidental outbound requests even if new code calls the provider.
    fetchSpy = jest.spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Outbound payment provider calls are forbidden in TV4 E2E'));
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));
    await app.init();
    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
  });

  beforeEach(async () => {
    const unique = randomUUID();
    const user = await prisma.user.create({
      data: {
        email: 'tv4-' + unique + '@example.test',
        passwordHash: 'test-only-hash',
        loyaltyPoints: 5,
      },
    });
    userId = user.id;
    token = jwtService.sign({ sub: user.id, email: user.email });

    const ingredient = await prisma.ingredient.create({
      data: {
        code: 'TV4_' + unique,
        name: 'Test ingredient ' + unique,
        stock: startStock,
        version: 0,
        unit: 'ML',
      },
    });
    ingredientId = ingredient.id;
    const product = await prisma.product.create({
      data: {
        name: 'Test drink ' + unique,
        price,
        imageUrl: '/test.png',
        stock: 100,
        sizes: [{ name: 'S', price: 0 }],
        toppings: [],
        ingredients: {
          create: [{
            ingredientId: ingredient.id,
            quantity: 1,
            size: 'S',
            topping: '',
          }],
        },
      },
    });
    productId = product.id;
  });

  afterEach(async () => {
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockClear();

    // Delete only data owned by this test, in foreign-key-safe order.
    // Order child rows (Payment, Attempt, Checkout, Item, Ingredient) cascade.
    if (userId !== undefined) await prisma.order.deleteMany({ where: { userId } });
    if (productId !== undefined) {
      await prisma.productIngredient.deleteMany({ where: { productId } });
      await prisma.product.delete({ where: { id: productId } });
    }
    if (ingredientId !== undefined) {
      await prisma.ingredient.delete({ where: { id: ingredientId } });
    }
    if (userId !== undefined) await prisma.user.delete({ where: { id: userId } });
    userId = undefined;
    productId = undefined;
    ingredientId = undefined;
    token = '';
  });

  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      jest.restoreAllMocks();
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('four concurrent signed webhooks settle once, replay safely and do not deduct stock twice', async () => {
    const response = await placeOrder(1);
    expect(response.status).toBe(201);
    const orderId: number = response.body.id;
    const total: number = response.body.total;
    expect(total).toBe(price);
    expect(await stockSnapshot()).toEqual({ stock: 1, version: 1 });

    const link = await testCheckout(orderId, total);
    const payload = signedEvent(orderId, total, link);
    const results = await Promise.all(Array.from({ length: 4 }, () =>
      request(app.getHttpServer()).post('/payments/payos/webhook').send(payload),
    ));
    expect(results.map((res) => res.status)).toEqual([200, 200, 200, 200]);
    expect(results.filter((res) => res.body.replayed === false)).toHaveLength(1);
    expect(results.filter((res) => res.body.replayed === true)).toHaveLength(3);

    const payments = await prisma.payment.findMany({ where: { orderId } });
    const attempts = await prisma.paymentAttempt.findMany({ where: { orderId } });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const checkout = await prisma.payosCheckout.findUniqueOrThrow({ where: { orderId } });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ amount: total, method: 'PAYOS_VIETQR' });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ outcome: 'SUCCESS', amount: total });
    expect(order.status).toBe('PAID');
    expect(checkout.status).toBe('PAID');
    expect(user.loyaltyPoints).toBe(5 + Math.floor(total / 10000));
    expect(await stockSnapshot()).toEqual({ stock: 1, version: 1 });

    const replay = await request(app.getHttpServer())
      .post('/api/payments/payos/webhook').send(payload);
    expect(replay.status).toBe(200);
    expect(replay.body.replayed).toBe(true);
    expect(await prisma.payment.count({ where: { orderId } })).toBe(1);
  });

  it('rejects forged signature and signed wrong amount without changing payment records', async () => {
    const response = await placeOrder(1);
    expect(response.status).toBe(201);
    const orderId: number = response.body.id;
    const total: number = response.body.total;
    const link = await testCheckout(orderId, total);
    const original = signedEvent(orderId, total, link);
    await request(app.getHttpServer())
      .post('/payments/payos/webhook')
      .send({ ...original, data: { ...original.data, amount: 1 } })
      .expect(400);
    await request(app.getHttpServer())
      .post('/payments/payos/webhook')
      .send(signedEvent(orderId, 1, link))
      .expect(400);

    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status)
      .toBe('PENDING');
    expect(await prisma.payment.count({ where: { orderId } })).toBe(0);
    expect(await prisma.paymentAttempt.count({ where: { orderId } })).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).loyaltyPoints)
      .toBe(5);
    expect(await stockSnapshot()).toEqual({ stock: 1, version: 1 });
  });

  it('five simultaneous orders cannot oversell two units of ingredient', async () => {
    const responses = await Promise.all(Array.from({ length: 5 }, () => placeOrder(1)));
    const passed = responses.filter((res) => res.status === 201);
    const rejected = responses.filter((res) => res.status !== 201);
    expect(passed.length).toBeGreaterThan(0);
    expect(passed.length).toBeLessThanOrEqual(startStock);
    for (const res of rejected) expect(res.status).toBe(409);

    expect(await stockSnapshot()).toEqual({
      stock: startStock - passed.length,
      version: passed.length,
    });
    expect(await prisma.order.count({ where: { userId } })).toBe(passed.length);
    const reservations = await prisma.orderIngredient.findMany({ where: { ingredientId } });
    expect(reservations).toHaveLength(passed.length);
    expect(reservations.reduce((sum, row) => sum + Number(row.quantity), 0))
      .toBe(passed.length);
  });

  it('quantity 3 (valid DTO) is rejected by actual stock 2 with no side effects', async () => {
    const before = await stockSnapshot();
    const response = await placeOrder(3);
    expect(response.status).toBe(409);
    expect(await stockSnapshot()).toEqual(before);
    expect(await prisma.order.count({ where: { userId } })).toBe(0);
    expect(await prisma.orderIngredient.count({ where: { ingredientId } })).toBe(0);
  });

  it('voucher failure AFTER stock decrement rolls back stock and ingredient version', async () => {
    const before = await stockSnapshot();
    const response = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', 'Bearer ' + token)
      .send({
        items: [{ productId, size: 'S', toppings: [], quantity: 1 }],
        voucherCode: 'NOT_A_REAL_VOUCHER',
      });
    // OrdersService changes stock before applyVoucher() inside the same transaction.
    expect(response.status).toBe(400);
    expect(await stockSnapshot()).toEqual(before);
    expect(await prisma.order.count({ where: { userId } })).toBe(0);
    expect(await prisma.orderIngredient.count({ where: { ingredientId } })).toBe(0);
  });
});
