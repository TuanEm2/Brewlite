import 'dotenv/config';
process.env.JWT_SECRET =
  process.env.JWT_SECRET ||
  'test_secret_must_be_at_least_32_characters_long_for_dev_mode!';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Orders API Auth Guard (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authService: AuthService;
  let validToken: string;
  let testUserId: number;
  let testProductId: number;
  const createdOrderIds: number[] = [];

  const sizes = [{ name: 'S', price: 0 }, { name: 'M', price: 5000 }];
  const toppings = [{ name: 'Trân châu', price: 5000 }];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    authService = app.get(AuthService);

    // Tạo sản phẩm và user riêng cho test
    const product = await prisma.product.create({
      data: {
        name: 'Guarded Order Drink',
        price: 35000,
        imageUrl: 'https://placehold.co/400x400?text=Guard',
        stock: 20,
        sizes,
        toppings,
      },
    });
    testProductId = product.id;

    const email = `guard-test-${Date.now()}@brewlite.vn`;
    const user = await authService.register({
      email,
      password: 'StrongPassword123!',
    });
    testUserId = user.id;

    const loginRes = await authService.login({
      email,
      password: 'StrongPassword123!',
    });
    validToken = loginRes.access_token;
  });

  afterAll(async () => {
    if (prisma) {
      if (createdOrderIds.length > 0) {
        await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
      }
      if (testProductId) {
        await prisma.product.deleteMany({ where: { id: testProductId } });
      }
      if (testUserId) {
        await prisma.user.deleteMany({ where: { id: testUserId } });
      }
    }
    await app?.close();
  });

  const payload = () => ({
    items: [
      {
        productId: testProductId,
        size: 'S',
        toppings: ['Trân châu'],
        quantity: 1,
      },
    ],
  });

  describe.each(['/orders', '/api/orders'])('%s', (endpoint) => {
    it('chặn khi không có Authorization header (401)', async () => {
      await request(app.getHttpServer())
        .post(endpoint)
        .send(payload())
        .expect(401);
    });

    it('chặn khi token sai định dạng Bearer (401)', async () => {
      await request(app.getHttpServer())
        .post(endpoint)
        .set('Authorization', 'Basic abcdef123456')
        .send(payload())
        .expect(401);
    });

    it('chặn khi token giả mạo hoặc sai chữ ký (401)', async () => {
      await request(app.getHttpServer())
        .post(endpoint)
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.signature')
        .send(payload())
        .expect(401);
    });

    it('tạo đơn PENDING thành công và lưu đúng userId từ JWT khi token hợp lệ (201)', async () => {
      const res = await request(app.getHttpServer())
        .post(endpoint)
        .set('Authorization', `Bearer ${validToken}`)
        .send(payload())
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.status).toBe('PENDING');
      expect(res.body.total).toBe(40000); // 35000 + 0 + 5000

      const orderId = res.body.id;
      createdOrderIds.push(orderId);

      const dbOrder = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(dbOrder.userId).toBe(testUserId);
      expect(dbOrder.status).toBe('PENDING');
    });
  });
});
