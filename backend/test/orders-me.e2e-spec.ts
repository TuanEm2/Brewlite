import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('GET /orders/me', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const userIds: number[] = [];
  let tokenA: string;
  let tokenB: string;
  let tokenEmpty: string;
  let olderId: number;
  let newerId: number;
  let otherId: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }));
    await app.init();

    prisma = app.get(PrismaService);
    const jwt = app.get(JwtService);
    const tokens: string[] = [];

    for (let i = 0; i < 3; i++) {
      const user = await prisma.user.create({
        data: {
          email: `history-${randomUUID()}@example.com`,
          passwordHash: 'test-fixture-not-for-login',
        },
      });
      userIds.push(user.id);
      tokens.push(await jwt.signAsync({ sub: user.id }));
    }

    [tokenA, tokenB, tokenEmpty] = tokens;

    const older = await prisma.order.create({
      data: {
        userId: userIds[0],
        status: 'PENDING',
        total: 70000,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    });
    olderId = older.id;

    const newer = await prisma.order.create({
      data: {
        userId: userIds[0],
        status: 'PAID',
        total: 63000,
        discount: 7000,
        voucherCode: 'BREW10',
        createdAt: new Date('2026-01-02T00:00:00Z'),
      },
    });
    newerId = newer.id;

    const other = await prisma.order.create({
      data: {
        userId: userIds[1],
        status: 'PENDING',
        total: 45000,
      },
    });
    otherId = other.id;
  });

  afterAll(async () => {
    try {
      if (prisma && userIds.length > 0) {
        await prisma.order.deleteMany({
          where: { userId: { in: userIds } },
        });
        await prisma.user.deleteMany({
          where: { id: { in: userIds } },
        });
      }
    } finally {
      await app?.close();
    }
  });

  describe.each(['/orders/me', '/api/orders/me'])('%s', (url) => {
    it('chỉ trả đơn của người A, mới nhất trước', async () => {
      const response = await request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(response.body.map((order: { id: number }) => order.id))
        .toEqual([newerId, olderId]);

      expect(response.body[0]).toMatchObject({
        status: 'PAID',
        total: 63000,
        discount: 7000,
        voucherCode: 'BREW10',
        items: [],
      });
    });

    it('người B chỉ thấy đơn của B', async () => {
      const response = await request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      expect(response.body.map((order: { id: number }) => order.id))
        .toEqual([otherId]);
    });

    it('chưa có đơn trả mảng rỗng', async () => {
      const response = await request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${tokenEmpty}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('không cho đổi chủ đơn bằng query userId', async () => {
      const response = await request(app.getHttpServer())
        .get(url)
        .query({ userId: userIds[1] })
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(response.body.map((order: { id: number }) => order.id))
        .toEqual([newerId, olderId]);
    });

    it('thiếu token trả 401', async () => {
      await request(app.getHttpServer())
        .get(url)
        .expect(401);
    });

    it('token sai trả 401', async () => {
      await request(app.getHttpServer())
        .get(url)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });
});