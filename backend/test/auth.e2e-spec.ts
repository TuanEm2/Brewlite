import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const email = `auth-test-${randomUUID()}@example.com`;
  const password = 'BrewLite@123';
  let userId: number | undefined;

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
    jwt = app.get(JwtService);

    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password })
      .expect(201);

    userId = response.body.id;
  });

  afterAll(async () => {
    if (prisma) {
      // Chỉ xóa tài khoản có email ngẫu nhiên của lần test này.
      await prisma.user.deleteMany({ where: { email } });
    }
    await app?.close();
  });

  it('đăng ký lưu tài khoản với mật khẩu đã băm', async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
    });

    expect(user.id).toBe(userId);
    expect(user.passwordHash).not.toBe(password);
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(user.loyaltyPoints).toBe(0);
  });

  it('email trùng, kể cả khác chữ hoa, trả 409', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: email.toUpperCase(), password })
      .expect(409);
  });

  it('đăng nhập trả JWT có chữ ký hợp lệ, đúng user và hạn 1 giờ', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    expect(response.body.user).toEqual({ id: userId, email });
    expect(response.body.token_type).toBe('Bearer');
    expect(response.body).not.toHaveProperty('password');
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(response.body.user).not.toHaveProperty('passwordHash');

    const payload = await jwt.verifyAsync(response.body.access_token);

    expect(payload.sub).toBe(userId);
    expect(payload.exp - payload.iat).toBe(3600);
    expect(payload).not.toHaveProperty('password');
    expect(payload).not.toHaveProperty('passwordHash');
  });

  it('sai mật khẩu trả 401 và không trả token', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'SaiMatKhau@123' })
      .expect(401);

    expect(response.body).not.toHaveProperty('access_token');
  });

  it('email không tồn tại trả 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: `missing-${randomUUID()}@example.com`,
        password,
      })
      .expect(401);
  });

  it('email sai định dạng trả 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'invalid-email', password })
      .expect(400);
  });

  it('không cho tự khai báo điểm loyalty khi đăng ký', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, loyaltyPoints: 99999 })
      .expect(400);
  });
});