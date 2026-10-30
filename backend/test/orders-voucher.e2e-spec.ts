import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Orders voucher (HTTP + PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: number | undefined;
  let productId: number | undefined;
  let ingredientId: number | undefined;
  let token: string;

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

    const user = await prisma.user.create({
      data: {
        email: `voucher-${randomUUID()}@example.com`,
        passwordHash: 'test-fixture-not-for-login',
      },
    });
    userId = user.id;

    token = await app.get(JwtService).signAsync({ sub: user.id });

    // 1. Tạo nguyên liệu mẫu với tồn kho ban đầu = 10
    const ingredient = await prisma.ingredient.create({
      data: {
        code: `ING_VOUCHER_${randomUUID().substring(0, 6)}`,
        name: `Voucher Test Ingredient ${randomUUID()}`,
        unit: 'G',
        stock: 10,
        version: 0,
      },
    });
    ingredientId = ingredient.id;

    // 2. Tạo sản phẩm mẫu
    const product = await prisma.product.create({
      data: {
        name: `Voucher test ${randomUUID()}`,
        price: 70000,
        imageUrl: '/test.png',
        sizes: [{ name: 'S', price: 0 }],
        toppings: [],
      },
    });
    productId = product.id;

    // 3. Liên kết sản phẩm với nguyên liệu qua ProductIngredient (1 ly tiêu tốn 1 đơn vị nguyên liệu)
    await prisma.productIngredient.create({
      data: {
        productId: product.id,
        ingredientId: ingredient.id,
        quantity: 1,
        size: 'S',
        topping: '',
      },
    });
  });

  afterAll(async () => {
    try {
      if (prisma && userId !== undefined) {
        await prisma.orderItem.deleteMany({ where: { order: { userId } } });
        await prisma.order.deleteMany({ where: { userId } });
        await prisma.user.delete({ where: { id: userId } });
      }
      if (prisma && productId !== undefined) {
        await prisma.productIngredient.deleteMany({ where: { productId } });
        await prisma.product.delete({ where: { id: productId } });
      }
      if (prisma && ingredientId !== undefined) {
        await prisma.ingredient.delete({ where: { id: ingredientId } });
      }
    } finally {
      await app?.close();
    }
  });

  function payload(key: string, voucherCode?: string) {
    return {
      items: [{
        productId: productId!,
        size: 'S',
        toppings: [],
        quantity: 1,
      }],
      idempotencyKey: key,
      ...(voucherCode === undefined ? {} : { voucherCode }),
    };
  }

  function post(body: object) {
    return request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  it('lưu đúng mã, tiền giảm và tổng tiền; thử lại không trừ kho lần hai', async () => {
    const key = randomUUID();
    const before = await prisma.ingredient.findUniqueOrThrow({
      where: { id: ingredientId! },
    });

    const first = await post(payload(key, ' brew10 ')).expect(201);

    expect(first.body).toMatchObject({
      status: 'PENDING',
      voucherCode: 'BREW10',
      discount: 7000,
      total: 63000,
    });

    const saved = await prisma.order.findUniqueOrThrow({
      where: { id: first.body.id },
    });
    expect(saved).toMatchObject({
      userId,
      voucherCode: 'BREW10',
      discount: 7000,
      total: 63000,
    });

    const replay = await post(payload(key, 'BREW10')).expect(201);
    expect(replay.body.id).toBe(first.body.id);

    const after = await prisma.ingredient.findUniqueOrThrow({
      where: { id: ingredientId! },
    });
    expect(Number(after.stock)).toBe(Number(before.stock) - 1);
    expect(after.version).toBe(before.version + 1);
    expect(await prisma.order.count({
      where: { idempotencyKey: key },
    })).toBe(1);
  });

  it('mã sai trả 400, rollback tồn kho và không tạo đơn', async () => {
    const key = randomUUID();
    const before = await prisma.ingredient.findUniqueOrThrow({
      where: { id: ingredientId! },
    });

    await post(payload(key, 'INVALID')).expect(400);

    const after = await prisma.ingredient.findUniqueOrThrow({
      where: { id: ingredientId! },
    });
    expect(Number(after.stock)).toBe(Number(before.stock));
    expect(after.version).toBe(before.version);
    expect(await prisma.order.count({
      where: { idempotencyKey: key },
    })).toBe(0);
  });

  it('cùng key nhưng đổi voucher bị chặn bằng 409', async () => {
    const key = randomUUID();
    await post(payload(key)).expect(201);

    const before = await prisma.ingredient.findUniqueOrThrow({
      where: { id: ingredientId! },
    });

    await post(payload(key, 'BREW10')).expect(409);

    const after = await prisma.ingredient.findUniqueOrThrow({
      where: { id: ingredientId! },
    });
    expect(Number(after.stock)).toBe(Number(before.stock));
    expect(after.version).toBe(before.version);

    const saved = await prisma.order.findUniqueOrThrow({
      where: { idempotencyKey: key },
    });
    expect(saved.discount).toBe(0);
    expect(saved.total).toBe(70000);
    expect(saved.voucherCode).toBeNull();
  });

  it('voucher null bị DTO từ chối', async () => {
    const key = randomUUID();

    await post({
      ...payload(key),
      voucherCode: null,
    }).expect(400);

    expect(await prisma.order.count({
      where: { idempotencyKey: key },
    })).toBe(0);
  });
});