import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Sản phẩm riêng cho test, tạo và xóa trong file này để không đụng dữ liệu seed.
const fixture = {
  name: 'E2E Test Product',
  price: 30000,
  imageUrl: 'https://placehold.co/400x400?text=E2E',
  stock: 7,
  sizes: [
    { name: 'S', price: 0 },
    { name: 'M', price: 5000 },
  ],
  toppings: [{ name: 'Trân châu', price: 5000 }],
};

describe('Products API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let productId: number | undefined;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    productId = (await prisma.product.create({ data: fixture })).id;
  });

  afterAll(async () => {
    if (productId !== undefined) {
      await prisma.product.delete({ where: { id: productId } });
    }
    await app?.close();
  });

  describe.each(['/products', '/api/products'])('%s', (base) => {
    it('GET danh sách: 200, chỉ gồm id/name/price/imageUrl, sắp theo id', async () => {
      const res = await request(app.getHttpServer()).get(base).expect(200);

      const body = res.body as Array<{ id: number }>;
      expect(body.find((p) => p.id === productId)).toEqual({
        id: productId,
        name: fixture.name,
        price: fixture.price,
        imageUrl: fixture.imageUrl,
      });
      const ids = body.map((p) => p.id);
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
    });

    it('GET chi tiết: 200, thêm stock/sizes/toppings, không lộ version', async () => {
      const res = await request(app.getHttpServer())
        .get(`${base}/${productId}`)
        .expect(200);

      expect(res.body).toEqual({ id: productId, ...fixture });
    });

    it('GET chi tiết: 404 khi sản phẩm không tồn tại', async () => {
      await request(app.getHttpServer()).get(`${base}/2147483647`).expect(404);
    });

    it.each(['abc', '1.5', '0', '-1', '2147483648', '1abc'])(
      'GET chi tiết: 400 khi id = %s',
      async (badId) => {
        await request(app.getHttpServer()).get(`${base}/${badId}`).expect(400);
      },
    );
  });
});
