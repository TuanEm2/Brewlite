import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PayosService } from '../src/payments/payos.service';

describe('Webhook, Concurrency & Transaction Rollback Integration (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let authToken: string;

  // Khai báo ID dữ liệu cô lập cho từng test case
  let testUserId: number;
  let testIngredientId: number;
  let testProductId: number;
  let initialIngredientStock: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PayosService)
      .useValue({
        verifyWebhook: (input: any) => ({
          success: input?.success ?? true,
          orderCode: input?.data?.orderCode,
          amount: input?.data?.amount,
          reference: input?.data?.reference || 'REF_TEST_123',
          paymentLinkId: input?.data?.paymentLinkId || 'pl_123456',
        }),
        webhook: async (input: any) => {
          const orderCode = input?.data?.orderCode;
          if (orderCode) {
            const checkout = await prisma.payosCheckout.findUnique({
              where: { orderCode },
            });
            if (checkout) {
              await prisma.order.update({
                where: { id: checkout.orderId },
                data: { status: 'PAID' },
              });
              await prisma.payosCheckout.update({
                where: { orderCode },
                data: { status: 'PAID' },
              });
            }
          }
          return { success: true };
        },
        handleWebhook: async (input: any) => {
          const orderCode = input?.data?.orderCode;
          if (orderCode) {
            const checkout = await prisma.payosCheckout.findUnique({
              where: { orderCode },
            });
            if (checkout) {
              await prisma.order.update({
                where: { id: checkout.orderId },
                data: { status: 'PAID' },
              });
            }
          }
          return { success: true };
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    // 1. Tạo User riêng cho bộ test này
    const uniqueEmail = `test-e2e-${Date.now()}@brewlite.com`;
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail,
        passwordHash: 'dummy_hash',
      },
    });
    testUserId = user.id;

    // 2. Tạo Token JWT chuẩn cho User
    authToken = jwtService.sign({
      sub: user.id,
      id: user.id,
      email: user.email,
    });
  });

  afterAll(async () => {
    if (testUserId) {
      await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    }
    if (app) {
      await app.close();
    }
  });

  // =========================================================
  // SETUP & TEARDOWN DỮ LIỆU CÔ LẬP TRƯỚC VÀ SAU MỖI TEST CASE
  // =========================================================
  beforeEach(async () => {
    initialIngredientStock = 2; // Tồn kho ban đầu cố định = 2

    // Tạo nguyên liệu cô lập (đúng chuẩn Enum IngredientUnit.ML và mã code duy nhất)
    const ingredient = await prisma.ingredient.create({
      data: {
        code: `ING_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        name: `Nguyên liệu Test ${Date.now()}`,
        stock: initialIngredientStock,
        unit: 'ML', 
      },
    });
    testIngredientId = ingredient.id;

    // Tạo sản phẩm cô lập kèm công thức (ProductIngredient) đúng chuẩn schema
    const product = await prisma.product.create({
      data: {
        name: `Sản phẩm Test ${Date.now()}`,
        price: 30000,
        imageUrl: 'http://localhost/test.png',
        sizes: [{ name: 'S', price: 0 }],
        toppings: [],
        ingredients: {
          create: [
            {
              ingredientId: testIngredientId,
              size: 'S',
              topping: '',
              quantity: 1, // Mỗi ly dùng 1 đơn vị nguyên liệu
            },
          ],
        },
      },
    });
    testProductId = product.id;
  });

  afterEach(async () => {
    // Dọn dẹp triệt để dữ liệu phát sinh sau từng test case theo đúng thứ tự khóa ngoại
    if (testProductId) {
      await prisma.orderItem.deleteMany({
        where: { order: { userId: testUserId } },
      }).catch(() => {});
      await prisma.productIngredient.deleteMany({
        where: { productId: testProductId },
      }).catch(() => {});
      await prisma.product.delete({
        where: { id: testProductId },
      }).catch(() => {});
    }

    if (testIngredientId) {
      await prisma.orderIngredient.deleteMany({
        where: { ingredientId: testIngredientId },
      }).catch(() => {});
      await prisma.ingredient.delete({
        where: { id: testIngredientId },
      }).catch(() => {});
    }

    await prisma.payosCheckout.deleteMany({
      where: { order: { userId: testUserId } },
    }).catch(() => {});
    await prisma.order.deleteMany({
      where: { userId: testUserId },
    }).catch(() => {});
  });

  // =========================================================
  // 1. TEST WEBHOOK GỬI LẶP (IDEMPOTENCY)
  // =========================================================
  it('1. Test Webhook gửi lặp và chữ ký hợp lệ (Duplicate Webhook Idempotency)', async () => {
    if (!testProductId) throw new Error('Không tạo được sản phẩm test.');

    // 1. Tạo đơn hàng qua API
    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        items: [
          {
            productId: testProductId,
            quantity: 1,
            size: 'S',
            toppings: [],
          },
        ],
      });

    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body.id || orderRes.body.orderId;
    const orderTotal = orderRes.body.total || orderRes.body.amount;
    const orderCode = Number(`2600${orderId}`);

    // 2. Tạo hoặc cập nhật bản ghi checkout PENDING gắn với orderCode
    await prisma.payosCheckout.upsert({
      where: { orderId: orderId },
      update: { orderCode: orderCode, amount: orderTotal, status: 'PENDING' },
      create: {
        orderId: orderId,
        orderCode: orderCode,
        amount: orderTotal,
        status: 'PENDING',
      },
    });

    const webhookPayload = {
      success: true,
      data: {
        orderCode: orderCode,
        amount: orderTotal,
        reference: 'REF_TEST_123',
        paymentLinkId: 'pl_123456',
        code: '00',
        desc: 'success',
      },
      signature: 'mock_signature_for_testing',
    };

    const webhookUrl = '/payments/payos/webhook';

    // 3. Gửi Webhook lần 1 và lần 2 lặp lại
    const res1 = await request(app.getHttpServer())
      .post(webhookUrl)
      .send(webhookPayload);

    const res2 = await request(app.getHttpServer())
      .post(webhookUrl)
      .send(webhookPayload);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const updatedOrder = await prisma.order.findUnique({ where: { id: orderId } });
    expect(updatedOrder?.status).toBe('PAID');
  });

  // =========================================================
  // 2. TEST NHIỀU REQUEST ĐỒNG THỜI (CONCURRENCY)
  // =========================================================
  it('2. Test nhiều request đồng thời chứng minh số lượng bán không vượt tồn kho', async () => {
    if (!testProductId || !testIngredientId) {
      throw new Error('Dữ liệu sản phẩm hoặc nguyên liệu test chưa sẵn sàng.');
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
              size: 'S',
              toppings: [],
            },
          ],
        }),
    );

    const results = await Promise.all(concurrentRequests);
    const successCount = results.filter((r) => r.status === 201 || r.status === 200).length;
    const conflictCount = results.filter((r) => r.status === 409 || r.status === 400).length;

    expect(successCount + conflictCount).toBe(5);
    expect(successCount).toBeLessThanOrEqual(initialIngredientStock);

    const ingredientInDb = await prisma.ingredient.findUnique({
      where: { id: testIngredientId },
    });
    expect(Number(ingredientInDb?.stock)).toBe(initialIngredientStock - successCount);
    expect(Number(ingredientInDb?.stock)).toBeGreaterThanOrEqual(0);
  });

  // =========================================================
  // 3. TEST ROLLBACK TRANSACTION KHI THIẾU KHO
  // =========================================================
  it('3. Test Rollback Transaction khi mua vượt số lượng nguyên liệu tồn kho', async () => {
    if (!testIngredientId || !testProductId) {
      throw new Error('Dữ liệu sản phẩm hoặc nguyên liệu test chưa sẵn sàng.');
    }

    const stockBefore = initialIngredientStock;

    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        items: [
          {
            productId: testProductId,
            quantity: 9999,
            size: 'S',
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