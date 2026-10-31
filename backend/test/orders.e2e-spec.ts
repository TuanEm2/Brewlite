import 'dotenv/config';
import {
  BadRequestException,
  ConflictException,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { OrdersService } from '../src/orders/orders.service';
import { PrismaService } from '../src/prisma/prisma.service';

// Integration test cho OrdersService trên PostgreSQL thật.
// Dùng sản phẩm riêng, tạo và xóa trong file này để không đụng dữ liệu seed.
const sizes = [
  { name: 'S', price: 0 },
  { name: 'L', price: 10000 },
];
const toppings = [
  { name: 'Trân châu', price: 5000 },
  { name: 'Kem', price: 10000 },
];

describe('OrdersService.createPending (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orders: OrdersService;
  const productIds: number[] = [];
  const ingredientIds: number[] = [];
  const orderIds: number[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    orders = app.get(OrdersService);

    // Tạo nguyên liệu và liên kết với sản phẩm tương ứng để khớp cơ chế kho nguyên liệu
    const coffeesData = [
      { name: 'E2E Order Coffee', price: 30000, stock: 5 },
      { name: 'E2E Order Tea', price: 20000, stock: 3 },
    ];

    for (const data of coffeesData) {
      // 1. Tạo nguyên liệu đại diện cho sản phẩm
      const ing = await prisma.ingredient.create({
        data: {
          code: `ING_E2E_${Math.random().toString(36).substring(2, 8)}`,
          name: `Ingredient for ${data.name}`,
          unit: 'G',
          stock: data.stock,
          version: 0,
        },
      });
      ingredientIds.push(ing.id);

      // 2. Tạo sản phẩm
      const p = await prisma.product.create({
        data: {
          name: data.name,
          price: data.price,
          imageUrl: 'https://placehold.co/400x400?text=E2E',
          sizes,
          toppings,
        },
      });
      productIds.push(p.id);

      // 3. Liên kết sản phẩm với nguyên liệu qua ProductIngredient (1 ly tốn 1 đơn vị nguyên liệu)
      await prisma.productIngredient.create({
        data: {
          productId: p.id,
          ingredientId: ing.id,
          quantity: 1,
          size: 'S',
          topping: '',
        },
      });
    }
  });

  afterAll(async () => {
    if (prisma) {
      // 1. Xóa OrderItem của các đơn hàng test trước
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      // 2. Xóa đơn hàng
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
      // 3. Xóa bảng trung gian ProductIngredient
      await prisma.productIngredient.deleteMany({ where: { productId: { in: productIds } } });
      // 4. Xóa sản phẩm
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
      // 5. Xóa nguyên liệu test
      await prisma.ingredient.deleteMany({ where: { id: { in: ingredientIds } } });
    }
    await app?.close();
  });

  it('tạo đơn PENDING, tự tính giá và lưu đủ size/topping/đơn giá', async () => {
    const [coffee, tea] = productIds;
    const order = await orders.createPending(null, {
      items: [
        { productId: coffee, size: 'L', toppings: ['Kem', 'Trân châu'], quantity: 2 },
        { productId: tea, size: 'S', toppings: [], quantity: 1 },
      ],
    });
    orderIds.push(order.id);

    // Cà phê: 30.000 + 10.000 + 10.000 + 5.000 = 55.000 × 2 = 110.000; Trà: 20.000.
    expect(order).toMatchObject({ status: 'PENDING', total: 130000, discount: 0 });
    expect(order.items).toEqual([
      expect.objectContaining({
        productId: coffee,
        size: 'L',
        toppings: [
          { name: 'Kem', price: 10000 },
          { name: 'Trân châu', price: 5000 },
        ],
        quantity: 2,
        unitPrice: 55000,
        lineTotal: 110000,
      }),
      expect.objectContaining({ productId: tea, size: 'S', toppings: [], unitPrice: 20000, lineTotal: 20000 }),
    ]);

    const saved = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });
    expect(saved.userId).toBeNull();
    expect(saved.status).toBe('PENDING');
    expect(saved.items).toHaveLength(2);
  });

  it('trừ đúng tồn kho nguyên liệu khi tạo đơn PENDING', async () => {
    const coffeeIng = await prisma.ingredient.findUniqueOrThrow({
      where: { id: ingredientIds[0] },
    });
    const teaIng = await prisma.ingredient.findUniqueOrThrow({
      where: { id: ingredientIds[1] },
    });

    // Ban đầu coffee stock = 5, order mua 2 -> còn 3.
    // Ban đầu tea stock = 3, order mua 1 -> còn 2.
    expect(Number(coffeeIng.stock)).toBe(3);
    expect(Number(teaIng.stock)).toBe(2);
    expect(coffeeIng.version).toBe(1);
    expect(teaIng.version).toBe(1);
  });

  it('404 khi có sản phẩm không tồn tại, không tạo đơn', async () => {
    const before = await prisma.order.count();
    await expect(
      orders.createPending(null, {
        items: [{ productId: 2147483647, size: 'S', toppings: [], quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.order.count()).toBe(before);
  });

  it('400 khi size hoặc topping không thuộc sản phẩm', async () => {
    await expect(
      orders.createPending(null, {
        items: [{ productId: productIds[0], size: 'M', toppings: [], quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('409 khi tổng số lượng các dòng cùng sản phẩm vượt tồn kho nguyên liệu', async () => {
    const tea = productIds[1]; // Nguyên liệu trà hiện còn tồn kho là 2
    await expect(
      orders.createPending(null, {
        items: [
          { productId: tea, size: 'S', toppings: [], quantity: 2 },
          { productId: tea, size: 'L', toppings: ['Kem'], quantity: 1 }, // Tổng yêu cầu là 3 (> 2) -> Sẽ báo 409 Conflict
        ],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});