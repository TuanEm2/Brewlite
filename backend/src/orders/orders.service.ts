import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricedOption } from '../products/dto/product-response.dto';
import { ProductsService } from '../products/products.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { isAwaitingPayment } from './order-expiry';
import { assertTransition } from './order-state';
import { orderTotal, priceLine } from './pricing';
import { applyVoucher } from './voucher';

const ORDER_INCLUDE = { items: { orderBy: { id: 'asc' } } } satisfies Prisma.OrderInclude;
// Chỉ PaymentsService được ghi các trạng thái này, để không thể "đánh dấu đã trả tiền" mà không thanh toán.
const PAYMENT_ONLY_STATUSES: readonly OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.PAID,
  OrderStatus.PAYMENT_FAILED,
];
type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
  ) {}

  async findMyOrders(userId: number): Promise<OrderResponseDto[]> {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      include: ORDER_INCLUDE,
    });

    return orders.map(toResponse);
  }

  /** Lấy đơn theo id, chỉ trả đơn do người dùng hiện tại sở hữu. */
  async findOwnedOrder(userId: number, orderId: number): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: ORDER_INCLUDE,
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
    return toResponse(order);
  }

  /**
   * Đổi trạng thái đơn qua máy trạng thái (Task 10), ví dụ PAID → PREPARING → READY → COMPLETED
   * hoặc hủy. Thanh toán (PAID / PAYMENT_FAILED) do PaymentsService xử lý.
   */
  async changeStatus(orderId: number, to: OrderStatus): Promise<OrderResponseDto> {
    if (to === OrderStatus.CANCELLED) {
      return this.cancelOrderAndReleaseStock(orderId);
    }
    if (PAYMENT_ONLY_STATUSES.includes(to)) {
      throw new BadRequestException(
        `Trạng thái ${to} chỉ được đặt qua thanh toán (POST /payments/mock).`,
      );
    }
    const current = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    if (!current) throw new NotFoundException('Không tìm thấy đơn hàng.');
    assertTransition(current.status, to);

    const { count } = await this.prisma.order.updateMany({
      where: { id: orderId, status: current.status },
      data: { status: to },
    });
    if (count === 0) {
      throw new ConflictException('Trạng thái đơn vừa được cập nhật bởi yêu cầu khác, hãy tải lại.');
    }
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    return toResponse(order);
  }

  /** Only the order owner can cancel their order. Stock is returned atomically. */
  async cancelOwnedOrder(userId: number, orderId: number): Promise<OrderResponseDto> {
    return this.cancelOrderAndReleaseStock(orderId, userId);
  }

  /**
   * Hủy đơn và hoàn trả tồn kho nguyên liệu dựa trên snapshot OrderIngredient thực tế đã lưu khi đặt hàng.
   */
  private async cancelOrderAndReleaseStock(orderId: number, userId?: number): Promise<OrderResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE
      `;
      if (locked.length === 0) throw new NotFoundException('Không tìm thấy đơn hàng.');
      
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          ...ORDER_INCLUDE,
          items: true,
        },
      });

      if (userId !== undefined && order.userId !== userId) {
        throw new NotFoundException('Không tìm thấy đơn hàng.');
      }
      assertTransition(order.status, OrderStatus.CANCELLED);

      // Real-money payOS refunds/link cancellation are not implemented.
      // Never release reserved ingredients while an external payment can still arrive.
      const externalCheckout = await tx.payosCheckout.findUnique({ where: { orderId } });
      if (externalCheckout) {
        throw new ConflictException(
          'Đơn đã tạo giao dịch thanh toán thật; cần đối soát và xử lý hủy/hoàn tiền với nhà cung cấp.'
        );
      }

      await releaseReservedIngredients(tx, orderId);

      // Điểm tích lũy chỉ cộng sau khi PAID. Thu hồi lại khi đơn đã thanh toán bị hủy.
      if (order.status === OrderStatus.PAID && order.userId !== null) {
        const earned = Math.floor(order.total / 10000);
        await tx.user.update({
          where: { id: order.userId },
          data: { loyaltyPoints: { decrement: earned } },
        });
      }

      const cancelled = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
        include: ORDER_INCLUDE,
      });
      return toResponse(cancelled);
    });
  }

  /**
   * Hết hạn một đơn chưa thanh toán (TV3): PENDING/PAYMENT_FAILED → CANCELLED và hoàn kho nguyên liệu.
   *
   * Chỉ gọi khi chắc chắn không còn tiền thật nào có thể tới: đơn không có link payOS, hoặc payOS
   * đã xác nhận link CANCELLED/EXPIRED (truyền `providerStatus` để ghi lại vào PayosCheckout).
   *
   * @returns false nếu đơn không còn chờ thanh toán (đã PAID, đã hủy…) nên không làm gì.
   */
  async expireUnpaidOrder(orderId: number, providerStatus?: 'CANCELLED' | 'EXPIRED'): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE
      `;
      if (locked.length === 0) return false;
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      if (!isAwaitingPayment(order.status)) return false;

      const checkout = await tx.payosCheckout.findUnique({ where: { orderId } });
      if (checkout && !providerStatus) {
        throw new ConflictException('Đơn có link payOS: phải xác nhận trạng thái với payOS trước khi hết hạn.');
      }

      assertTransition(order.status, OrderStatus.CANCELLED);
      await releaseReservedIngredients(tx, orderId);
      await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.CANCELLED } });
      if (checkout && providerStatus) {
        await tx.payosCheckout.update({ where: { orderId }, data: { status: providerStatus } });
      }
      return true;
    });
  }

  /**
   * Tạo đơn ở trạng thái PENDING từ giỏ hàng đã validate.
   * Lọc công thức linh hoạt theo size/topping, kiểm tra tồn kho và lưu snapshot OrderIngredient.
   */
  async createPending(
    userId: number | null,
    dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    if (dto.idempotencyKey) {
      const previous = await this.prisma.order.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: ORDER_INCLUDE,
      });
      if (previous) return replayExistingOrder(previous, userId, dto);
    }

    const productIds = [...new Set(dto.items.map((item) => item.productId))];

    let order: OrderWithItems;
    try {
      order = await this.prisma.$transaction(async (tx) => {
        const rawProducts = await tx.product.findMany({
          where: { id: { in: productIds } },
        });
        const products = new Map(rawProducts.map((p) => [p.id, p]));

        const missing = productIds.filter((id) => !products.has(id));
        if (missing.length > 0) {
          throw new NotFoundException(
            `Không tìm thấy sản phẩm có id ${missing.join(', ')}`,
          );
        }

        const rawProductIngredients = await tx.productIngredient.findMany({
          where: { productId: { in: productIds } },
          include: { ingredient: true },
        });

        const productIngredientsMap = new Map<number, any[]>();
        for (const pi of rawProductIngredients) {
          const list = productIngredientsMap.get(pi.productId) ?? [];
          list.push(pi);
          productIngredientsMap.set(pi.productId, list);
        }

        const requiredIngredients = new Map<number, { name: string; requiredQty: number; ingredient: any }>();
        const ingredientSnapshotsMap = new Map<number, number>();

        for (const item of dto.items) {
          const pis = productIngredientsMap.get(item.productId) ?? [];
          
          let basePis = pis.filter((pi) => pi.size && pi.size === item.size);
          if (basePis.length === 0) {
            basePis = pis.filter((pi) => !pi.size || pi.size === '');
          }
          if (basePis.length === 0) {
            basePis = pis;
          }

          const selectedToppings = item.toppings ?? [];
          let matchedPis = basePis.filter((pi) => !pi.topping || pi.topping === '' || selectedToppings.includes(pi.topping));
          if (matchedPis.length === 0) {
            matchedPis = basePis;
          }

          for (const pi of matchedPis) {
            const totalNeeded = Number(pi.quantity) * item.quantity;
            if (totalNeeded <= 0) continue;

            const current = requiredIngredients.get(pi.ingredientId) ?? {
              name: pi.ingredient.name,
              requiredQty: 0,
              ingredient: pi.ingredient,
            };

            current.requiredQty += totalNeeded;
            requiredIngredients.set(pi.ingredientId, current);

            const existingQty = ingredientSnapshotsMap.get(pi.ingredientId) ?? 0;
            ingredientSnapshotsMap.set(pi.ingredientId, existingQty + totalNeeded);
          }
        }

        // 2. Kiểm tra tồn kho nguyên liệu và trừ kho bằng Optimistic Locking
        for (const [ingredientId, data] of requiredIngredients) {
          const ing = data.ingredient;

          if (data.requiredQty > ing.stock) {
            throw new ConflictException(
              `Nguyên liệu "${ing.name}" đã hết (chỉ còn ${ing.stock}), không đủ cho đơn hàng này!`,
            );
          }

          const updateResult = await tx.ingredient.updateMany({
            where: {
              id: ingredientId,
              version: ing.version,
              stock: { gte: data.requiredQty },
            },
            data: {
              stock: { decrement: data.requiredQty },
              version: { increment: 1 },
            },
          });

          if (updateResult.count === 0) {
            throw new ConflictException(
              `Xung đột kho nguyên liệu "${ing.name}" do có đơn hàng đồng thời. Vui lòng thử lại!`,
            );
          }
        }

        const lines = dto.items.map((item) =>
          priceLine(products.get(item.productId) as any, item.size, item.toppings, item.quantity),
        );

        const promotion = applyVoucher(
          orderTotal(lines),
          dto.voucherCode,
        );

        const createdOrder = await tx.order.create({
          data: {
            userId,
            idempotencyKey: dto.idempotencyKey,
            status: OrderStatus.PENDING,
            total: promotion.total,
            discount: promotion.discount,
            voucherCode: promotion.voucherCode,
            items: {
              create: lines.map((line) => ({
                productId: line.productId,
                productName: line.productName,
                size: line.size,
                toppings: line.toppings as unknown as Prisma.InputJsonValue,
                qty: line.quantity,
                unitPrice: line.unitPrice,
                lineTotal: line.lineTotal,
              })),
            },
          },
          include: ORDER_INCLUDE,
        });

        const ingredientSnapshots = Array.from(ingredientSnapshotsMap.entries()).map(
          ([ingredientId, quantity]) => ({
            orderId: createdOrder.id,
            ingredientId,
            quantity,
          }),
        );

        if (ingredientSnapshots.length > 0) {
          await tx.orderIngredient.createMany({
            data: ingredientSnapshots,
          });
        }

        return createdOrder;
      });
    } catch (error: unknown) {
      if (dto.idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const previous = await this.prisma.order.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
          include: ORDER_INCLUDE,
        });
        if (previous) return replayExistingOrder(previous, userId, dto);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('Đặt hàng đồng thời bị xung đột. Vui lòng thử lại.');
      }
      throw error;
    }

    return toResponse(order);
  }
}

/**
 * Hoàn kho nguyên liệu theo snapshot OrderIngredient đã lưu lúc tạo đơn (khóa theo thứ tự id tăng dần).
 * Đơn cũ không có snapshot thì không hoàn, tránh cộng bừa kho.
 */
async function releaseReservedIngredients(tx: Prisma.TransactionClient, orderId: number): Promise<void> {
  const orderIngredients = await tx.orderIngredient.findMany({ where: { orderId } });
  const quantities = new Map<number, number>();
  for (const oi of orderIngredients) {
    quantities.set(oi.ingredientId, (quantities.get(oi.ingredientId) ?? 0) + Number(oi.quantity));
  }
  for (const [ingredientId, quantity] of [...quantities].sort(([a], [b]) => a - b)) {
    await tx.ingredient.update({
      where: { id: ingredientId },
      data: { stock: { increment: quantity }, version: { increment: 1 } },
    });
  }
}

function replayExistingOrder(
  previous: OrderWithItems,
  userId: number | null,
  dto: CreateOrderDto,
): OrderResponseDto {
  const requestedVoucher = dto.voucherCode === undefined
    ? null
    : dto.voucherCode.trim().toUpperCase();

  if ((previous.voucherCode ?? null) !== requestedVoucher) {
    throw new ConflictException(
      'Idempotency key đã được sử dụng với mã giảm giá khác.',
    );
  }
  if (previous.userId !== userId || canonicalItems(previous.items.map((item) => ({
    productId: item.productId,
    size: item.size,
    toppings: (item.toppings as unknown as PricedOption[]).map((t) => t.name),
    quantity: item.qty,
  }))) !== canonicalItems(dto.items)) {
    throw new ConflictException('Idempotency key đã sử dụng cho một đơn hàng khác.');
  }
  return toResponse(previous);
}

function canonicalItems(items: Array<{
  productId: number; size: string; toppings: string[]; quantity: number;
}>): string {
  return JSON.stringify(items.map((item) => [
    item.productId, item.size, [...item.toppings].sort(), item.quantity,
  ]).map((item) => JSON.stringify(item)).sort());
}

function toResponse(order: OrderWithItems): OrderResponseDto {
  return {
    id: order.id,
    status: order.status,
    total: order.total,
    discount: order.discount,
    voucherCode: order.voucherCode ?? null,
    createdAt: order.createdAt,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      size: item.size,
      toppings: item.toppings as unknown as PricedOption[],
      quantity: item.qty,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
  };
}