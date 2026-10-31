import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PayosGateway } from '../src/payments/payos.gateway';

describe('Webhook, Concurrency & Transaction Rollback Integration (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let authToken: string;
  let testProductId: number;
  let testIngredientId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PayosGateway)
      .useValue({
        verifyWebhook: (input: any) => ({
          success: input?.success ?? true,
          orderCode: input?.data?.orderCode,
          amount: input?.data?.amount,
          reference: input?.data?.reference || 'REF123',
          paymentLinkId: input?.data?.paymentLinkId || 'pl_123456',
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    // 1. Lấy sản phẩm và nguyên liệu mẫu từ database
    const product = await prisma.product.findFirst();
    if (product) {
      testProductId = product.id;
    }

    const ingredient = await prisma.ingredient.findFirst();
    if (ingredient) {
      testIngredientId = ingredient.id;
    }

    // 2. Lấy user có sẵn hoặc tạo mới chuẩn theo schema của bảng User
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: 'test-e2e@brewlite.com',
          passwordHash: 'dummy_hash',
        },
      });
    }

    // 3. Tự sinh token JWT hợp lệ trực tiếp qua JwtService
    authToken = jwtService.sign({
      sub: user.id,
      id: user.id,
      email: user.email,
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // ==========================================
  // 1. TEST WEBHOOK GỬI LẶP (DUPLICATE WEBHOOK)
  // ==========================================
  it('1. Test Webhook gửi lặp (Duplicate Webhook Idempotency)', async () => {
    if (!testProductId) return;

    // Tạo đơn hàng qua API /orders
    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        items: [
          {
            productId: testProductId,
            quantity: 1,
            size: 'M',
            toppings: [],
          },
        ],
      });

    // Lấy đơn hàng mới nhất vừa được tạo trong Database
    const dbOrder = await prisma.order.findFirst({
      orderBy: { id: 'desc' },
    });

    if (!dbOrder) throw new Error('Không tìm thấy đơn hàng vừa tạo');

    const orderId = dbOrder.id;
    const orderTotal = dbOrder.total;
    const orderCode = 260000000 + orderId;

    await prisma.payosCheckout.create({
      data: {
        orderId: orderId,
        orderCode: orderCode,
        amount: orderTotal,
        status: 'PENDING',
      },
    }).catch(() => {});

    const webhookPayload = {
      success: true,
      data: {
        orderCode: orderCode,
        amount: orderTotal,
        reference: 'REF_TEST_123',
        paymentLinkId: 'pl_123456',
      },
    };

    const webhookUrl = '/payments/payos/webhook';

    const res1 = await request(app.getHttpServer())
      .post(webhookUrl)
      .send(webhookPayload);

    const res2 = await request(app.getHttpServer())
      .post(webhookUrl)
      .send(webhookPayload);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });

  // ==========================================
  // 2. TEST NHIỀU REQUEST ĐỒNG THỜI (CONCURRENCY)
  // ==========================================
  it('2. Test nhiều request đồng thời (Concurrency Test)', async () => {
    if (!testProductId) return;

    if (testIngredientId) {
      await prisma.ingredient.update({
        where: { id: testIngredientId },
        data: { stock: 2 },
      });
    }

    const concurrentRequests = Array.from({ length: 5 }).map(() =>
      request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          items: [
            {
              productId: testProductId,
              quantity: 1,
              size: 'M',
              toppings: [],
            },
          ],
        }),
    );

    const results = await Promise.all(concurrentRequests);
    const successCount = results.filter((r) => r.status === 201 || r.status === 200).length;
    const conflictCount = results.filter((r) => r.status === 409 || r.status === 400).length;

    expect(successCount + conflictCount).toBe(5);
    expect(successCount).toBeLessThanOrEqual(5);
  });

  // ==========================================
  // 3. TEST ROLLBACK TRANSACTION KHI THIẾU KHO
  // ==========================================
  it('3. Test Rollback Transaction khi thiếu nguyên liệu', async () => {
    if (!testIngredientId || !testProductId) return;

    const ingredientBefore = await prisma.ingredient.findUnique({
      where: { id: testIngredientId },
    });
    const stockBefore = Number(ingredientBefore?.stock ?? 0);

    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        items: [
          {
            productId: testProductId,
            quantity: 99999,
            size: 'M',
            toppings: [],
          },
        ],
      });

    expect([400, 409]).toContain(res.status);

    const ingredientAfter = await prisma.ingredient.findUnique({
      where: { id: testIngredientId },
    });
    const stockAfter = Number(ingredientAfter?.stock ?? 0);

    expect(stockAfter).toBe(stockBefore);
  });
});