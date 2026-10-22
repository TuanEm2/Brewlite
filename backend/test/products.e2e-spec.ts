import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const sizes = [
  { name: 'S', price: 0 },
  { name: 'M', price: 5000 },
];
const toppings = [{ name: 'Trân châu', price: 5000 }];

describe('Products API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let productId: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    const product = await prisma.product.create({
      data: {
        name: 'E2E Test Product',
        price: 30000,
        imageUrl: 'https://placehold.co/400x400?text=E2E',
        stock: 7,
        sizes,
        toppings,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await prisma.product.delete({ where: { id: productId } });
    await app.close();
  });

  describe.each(['/products', '/api/products'])('route %s', (base) => {
    describe('GET /products', () => {
      it('trả 200 và danh sách tóm tắt, sắp xếp theo id tăng dần', async () => {
        const res = await request(app.getHttpServer()).get(base).expect(200);

        const body = res.body as Array<Record<string, unknown>>;
        const item = body.find((p) => p.id === productId);
        expect(item).toEqual({
          id: productId,
          name: 'E2E Test Product',
          price: 30000,
          imageUrl: 'https://placehold.co/400x400?text=E2E',
        });
        const ids = body.map((p) => p.id as number);
        expect(ids).toEqual([...ids].sort((a, b) => a - b));
      });
    });

    describe('GET /products/:id', () => {
      it('trả 200 kèm stock, sizes, toppings và không lộ version', async () => {
        const res = await request(app.getHttpServer())
          .get(`${base}/${productId}`)
          .expect(200);

        expect(res.body).toEqual({
          id: productId,
          name: 'E2E Test Product',
          price: 30000,
          imageUrl: 'https://placehold.co/400x400?text=E2E',
          stock: 7,
          sizes,
          toppings,
        });
      });

      it('trả 404 khi sản phẩm không tồn tại', async () => {
        await request(app.getHttpServer()).get(`${base}/2147483647`).expect(404);
      });

      it.each(['abc', '1.5', '0', '-1', '2147483648', '1abc'])(
        'trả 400 khi id không hợp lệ: %s',
        async (badId) => {
          await request(app.getHttpServer()).get(`${base}/${badId}`).expect(400);
        },
      );
    });
  });
});
