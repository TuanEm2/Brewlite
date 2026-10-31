import { ConflictException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

const KEY = '42534e1e-4c59-4736-b9f1-23ca1bb39e03';
const payload = (): CreateOrderDto => ({
  idempotencyKey: KEY,
  items: [{ productId: 3, size: 'L', toppings: ['Kem'], quantity: 1 }],
});

const oldOrder = {
  id: 82,
  userId: 7,
  status: OrderStatus.PENDING,
  total: 65000,
  discount: 0,
  createdAt: new Date('2026-10-24T00:00:00Z'),
  items: [{
    id: 19,
    productId: 3,
    size: 'L',
    toppings: [{ name: 'Kem', price: 10000 }],
    qty: 1,
    unitPrice: 65000,
    lineTotal: 65000,
  }],
};

describe('CreateOrder idempotency — Sprint 3 TV1', () => {
  let service: OrdersService;
  let findUnique: jest.Mock;
  let create: jest.Mock;
  let findManyByIds: jest.Mock;
  let productFindMany: jest.Mock;
  let productUpdateMany: jest.Mock;
  let productIngredientFindMany: jest.Mock;
  let ingredientUpdateMany: jest.Mock;
  let orderIngredientCreateMany: jest.Mock;

  beforeEach(() => {
    findUnique = jest.fn().mockResolvedValue({ ...oldOrder });
    create = jest.fn().mockResolvedValue({ ...oldOrder });
    productFindMany = jest.fn().mockResolvedValue([{
      id: 3,
      name: 'Cappuccino',
      price: 45000,
      stock: 10,
      version: 0,
      sizes: [{ name: 'L', price: 10000 }],
      toppings: [{ name: 'Kem', price: 10000 }],
    }]);
    productUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    
    productIngredientFindMany = jest.fn().mockResolvedValue([
      {
        productId: 3,
        ingredientId: 'COFFEE',
        size: 'L',
        topping: '',
        quantity: 26,
        ingredient: { id: 'COFFEE', name: 'Cà phê', unit: 'G', stock: 1000, version: 0 },
      },
      {
        productId: 3,
        ingredientId: 'CREAM',
        size: 'L',
        topping: 'Kem',
        quantity: 20,
        ingredient: { id: 'CREAM', name: 'Kem', unit: 'G', stock: 1000, version: 0 },
      },
      {
        productId: 3,
        ingredientId: 'CUP',
        size: 'L',
        topping: '',
        quantity: 1,
        ingredient: { id: 'CUP', name: 'Ly', unit: 'PIECE', stock: 100, version: 0 },
      },
    ]);

    ingredientUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    orderIngredientCreateMany = jest.fn().mockResolvedValue({ count: 3 });

    findManyByIds = jest.fn().mockResolvedValue([{ id: 3, name: 'Cappuccino', price: 45000,
      stock: 10, sizes: [{ name: 'L', price: 10000 }], toppings: [{ name: 'Kem', price: 10000 }] }]);
    
    const mockPrismaClient = {
      order: { findUnique, create },
      product: {
        findMany: productFindMany,
        updateMany: productUpdateMany,
      },
      productIngredient: {
        findMany: productIngredientFindMany,
      },
      ingredient: {
        updateMany: ingredientUpdateMany,
      },
      orderIngredient: {
        createMany: orderIngredientCreateMany,
      },
    };
    
    const prisma = {
      ...mockPrismaClient,
      $transaction: jest.fn(async (callback) => callback(mockPrismaClient)),
    } as unknown as PrismaService;

    const products = { findManyByIds } as unknown as ProductsService;
    service = new OrdersService(prisma, products);
  });

  it('returns the same stored order for the same user, key and cart without new DB create', async () => {
    const first = await service.createPending(7, payload());
    const second = await service.createPending(7, payload());
    expect(first).toEqual(second);
    expect(first).toMatchObject({ id: 82, total: 65000, status: OrderStatus.PENDING });
    expect(create).not.toHaveBeenCalled();
    expect(findManyByIds).not.toHaveBeenCalled();
  });

  it('blocks the same key from being reused by another user', async () => {
    await expect(service.createPending(99, payload())).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });

  it('blocks changing the quantity with the same key', async () => {
    const changed = payload();
    changed.items[0].quantity = 2;
    await expect(service.createPending(7, changed)).rejects.toBeInstanceOf(ConflictException);
  });

  it('saves the idempotency key on new orders', async () => {
    findUnique.mockResolvedValue(null);
    await service.createPending(7, payload());
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 7, idempotencyKey: KEY, total: 65000 }),
    }));
  });
});