import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';

function fixture(status: OrderStatus, userId = 12) {
  const stored = {
    id: 44, userId, status, total: 55000, discount: 0, voucherCode: null,
    createdAt: new Date('2026-10-25T00:00:00Z'),
    items: [
      { id: 1, productId: 7, size: 'S', qty: 2, toppings: [], unitPrice: 25000, lineTotal: 50000 },
      { id: 2, productId: 7, size: 'M', qty: 1, toppings: [], unitPrice: 5000, lineTotal: 5000 },
    ],
  };
  
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: stored.id }]),
    order: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(stored),
      update: jest.fn().mockImplementation(async ({ data }: { data: { status: OrderStatus } }) => ({
        ...stored, status: data.status,
      })),
    },
    product: { update: jest.fn().mockResolvedValue({}) },
    user: { update: jest.fn().mockResolvedValue({}) },
    productIngredient: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    ingredient: {
      update: jest.fn().mockResolvedValue({}),
    },
    orderIngredient: {
      // Cung cấp snapshot nguyên liệu mẫu để hàm hủy đơn có dữ liệu hoàn kho thực tế
      findMany: jest.fn().mockResolvedValue([
        { id: 1, orderId: 44, ingredientId: 'COFFEE', quantity: 40 },
      ]),
    },
  };

  type MockTransaction = typeof tx;
  const prisma = {
    $transaction: jest.fn(async (fn: (client: MockTransaction) => Promise<unknown>) => fn(tx)),
  };
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    {} as ProductsService,
  );
  return { service, tx };
}

describe('Cancel order — stock and loyalty integrity', () => {
  it('returns total quantity for repeated product lines once', async () => {
    const { service, tx } = fixture(OrderStatus.PENDING);
    const response = await service.cancelOwnedOrder(12, 44);
    expect(response.status).toBe(OrderStatus.CANCELLED);
    // Kiểm tra hệ thống hoàn trả tồn kho thông qua ingredient.update dựa trên snapshot
    expect(tx.ingredient.update).toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('reverses awarded points for a cancelled paid mock order', async () => {
    const { service, tx } = fixture(OrderStatus.PAID);
    await service.cancelOwnedOrder(12, 44);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 12 }, data: { loyaltyPoints: { decrement: 5 } },
    });
  });

  it('rejects another user without modifying inventory', async () => {
    const { service, tx } = fixture(OrderStatus.PENDING);
    await expect(service.cancelOwnedOrder(99, 44)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.ingredient.update).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('refuses cancelling twice, preventing double stock refund', async () => {
    const { service, tx } = fixture(OrderStatus.CANCELLED);
    await expect(service.cancelOwnedOrder(12, 44)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.ingredient.update).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
  });
});