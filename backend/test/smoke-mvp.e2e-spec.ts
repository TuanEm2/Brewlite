import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Task 9 Smoke Test: Kiểm tra toàn bộ luồng MVP (Happy Path)
 * Menu -> Chi tiết -> Đăng ký/Đăng nhập -> Tạo đơn (Voucher) -> Thanh toán -> Xác nhận/Lịch sử -> Chuyển trạng thái
 */
describe('Smoke Test MVP End-to-End (Task 9 - TV6)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUserId: number;
  let authToken: string;
  let productId: number;
  let orderId: number;

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

    // 1. Chuẩn bị sản phẩm mẫu
    const product = await prisma.product.create({
      data: {
        name: 'Smoke Test Caramel Macchiato',
        price: 50000,
        imageUrl: 'https://placehold.co/400x400?text=Smoke',
        stock: 50,
        sizes: [
          { name: 'S', price: 0 },
          { name: 'M', price: 5000 },
          { name: 'L', price: 10000 },
        ],
        toppings: [
          { name: 'Trân châu', price: 5000 },
          { name: 'Kem', price: 10000 },
        ],
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    try {
      if (prisma) {
        if (orderId) {
          await prisma.paymentAttempt.deleteMany({ where: { orderId } });
          await prisma.payment.deleteMany({ where: { orderId } });
          await prisma.orderItem.deleteMany({ where: { orderId } });
          await prisma.order.deleteMany({ where: { id: orderId } });
        }
        if (productId) {
          await prisma.product.deleteMany({ where: { id: productId } });
        }
        if (testUserId) {
          await prisma.user.deleteMany({ where: { id: testUserId } });
        }
      }
    } finally {
      await app?.close();
    }
  });

  it('1. Xem danh sách Menu: GET /products trả về 200 có sản phẩm', async () => {
    const res = await request(app.getHttpServer()).get('/products').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find((p: { id: number }) => p.id === productId);
    expect(found).toBeDefined();
    expect(found.name).toBe('Smoke Test Caramel Macchiato');
  });

  it('2. Xem chi tiết món: GET /products/:id trả về đầy đủ size và topping', async () => {
    const res = await request(app.getHttpServer())
      .get(`/products/${productId}`)
      .expect(200);

    expect(res.body.id).toBe(productId);
    expect(res.body.sizes).toHaveLength(3);
    expect(res.body.toppings).toHaveLength(2);
  });

  it('3. Đăng ký & Đăng nhập: lấy token JWT hợp lệ', async () => {
    const email = `smoke-${randomUUID()}@brewlite.vn`;
    const password = 'StrongPassword123!';

    // Đăng ký
    const regRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);
    testUserId = regRes.body.id;
    expect(regRes.body.email).toBe(email);

    // Đăng nhập
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    authToken = loginRes.body.access_token;
    expect(authToken).toBeDefined();
  });

  it('4. Tạo đơn PENDING kèm voucher BREW10: POST /orders', async () => {
    const orderPayload = {
      items: [
        {
          productId,
          size: 'M', // 50000 + 5000 = 55000
          toppings: ['Trân châu'], // + 5000 = 60000
          quantity: 1,
        },
      ],
      voucherCode: 'BREW10', // Giảm 10% của 60.000 = 6.000 -> Còn 54.000
      idempotencyKey: randomUUID(),
    };

    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${authToken}`)
      .send(orderPayload)
      .expect(201);

    expect(res.body.status).toBe('PENDING');
    expect(res.body.discount).toBe(6000);
    expect(res.body.total).toBe(54000);
    expect(res.body.voucherCode).toBe('BREW10');
    orderId = res.body.id;
  });

  it('5. Thanh toán không tiền mặt: POST /payments/mock chuyển sang PAID và cộng Loyalty Points', async () => {
    const paymentKey = randomUUID();
    const paymentPayload = {
      orderId,
      idempotencyKey: paymentKey,
      method: 'MOCK_QR',
      outcome: 'SUCCESS',
    };

    const res = await request(app.getHttpServer())
      .post('/payments/mock')
      .set('Authorization', `Bearer ${authToken}`)
      .send(paymentPayload)
      .expect(200);

    expect(res.body.status).toBe('PAID');
    expect(res.body.outcome).toBe('SUCCESS');
    expect(res.body.replayed).toBe(false);

    // Kiểm tra điểm loyalty (54.000đ -> được 5 điểm vì 1 điểm / 10.000đ)
    const user = await prisma.user.findUniqueOrThrow({ where: { id: testUserId } });
    expect(user.loyaltyPoints).toBe(5);

    // Gửi lại cùng idempotency key để kiểm tra chống thanh toán lặp
    const replayRes = await request(app.getHttpServer())
      .post('/payments/mock')
      .set('Authorization', `Bearer ${authToken}`)
      .send(paymentPayload)
      .expect(200);
    expect(replayRes.body.replayed).toBe(true);
  });

  it('6. Kiểm tra lịch sử đơn: GET /orders/me thấy đơn đã PAID', async () => {
    const res = await request(app.getHttpServer())
      .get('/orders/me')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const myOrder = res.body.find((o: { id: number }) => o.id === orderId);
    expect(myOrder).toBeDefined();
    expect(myOrder.status).toBe('PAID');
    expect(myOrder.total).toBe(54000);
    expect(myOrder.discount).toBe(6000);
  });
});
