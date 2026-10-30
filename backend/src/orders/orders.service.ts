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
   * Hủy đơn và hoàn trả tồn kho nguyên liệu một cách nguyên vẹn (Atomic & Row locking).
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
          items: {
            include: {
              product: true,
            },
          },
        },
      });

      if (userId !== undefined && order.userId !== userId) {
        throw new NotFoundException('Không tìm thấy đơn hàng.');
      }
      assertTransition(order.status, OrderStatus.CANCELLED);

      // Lấy danh sách sản phẩm trong đơn để tra cứu nguyên liệu độc lập qua bảng trung gian
      const productIdsInOrder = [...new Set(order.items.map((item) => item.productId))];
      const rawProductIngredients = await tx.productIngredient.findMany({
        where: { productId: { in: productIdsInOrder } },
        include: { ingredient: true },
      });

      const productIngredientsMap = new Map<number, any[]>();
      for (const pi of rawProductIngredients) {
        const list = productIngredientsMap.get(pi.productId) ?? [];
        list.push(pi);
        productIngredientsMap.set(pi.productId, list);
      }

      // Tính tổng nguyên liệu cần hoàn trả dựa trên sản phẩm và định lượng cấu thành
      const ingredientQuantities = new Map<number, number>();
      for (const item of order.items) {
        const pis = productIngredientsMap.get(item.productId) ?? [];
        for (const pi of pis) {
          const totalReturn = Number(pi.quantity) * item.qty;
          ingredientQuantities.set(
            pi.ingredientId,
            (ingredientQuantities.get(pi.ingredientId) ?? 0) + totalReturn,
          );
        }
      }

      // Hoàn trả tồn kho và tăng version cho từng nguyên liệu
      for (const [ingredientId, quantity] of [...ingredientQuantities].sort(([a], [b]) => a - b)) {
        await tx.ingredient.update({
          where: { id: ingredientId },
          data: {
            stock: { increment: quantity },
            version: { increment: 1 },
          },
        });
      }

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
   * Tạo đơn ở trạng thái PENDING từ giỏ hàng đã validate.
   * Kiểm tra tồn kho nguyên liệu, đảm bảo "hết nguyên liệu mà còn ly thì báo hết hàng" 
   * kết hợp Optimistic Locking.
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
        // Lấy danh sách sản phẩm
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

        // Lấy thông tin quan hệ product-ingredient độc lập từ bảng trung gian
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

        // 1. Tính tổng số lượng nguyên liệu cần thiết cho đơn hàng này
        const requiredIngredients = new Map<number, { name: string; requiredQty: number; ingredient: any }>();

        for (const item of dto.items) {
          const pis = productIngredientsMap.get(item.productId) ?? [];
          for (const pi of pis) {
            const totalNeeded = Number(pi.quantity) * item.quantity;
            
            const current = requiredIngredients.get(pi.ingredientId) ?? {
              name: pi.ingredient.name,
              requiredQty: 0,
              ingredient: pi.ingredient,
            };
            
            current.requiredQty += totalNeeded;
            requiredIngredients.set(pi.ingredientId, current);
          }
        }

        // 2. Kiểm tra tồn kho nguyên liệu và trừ kho bằng Optimistic Locking
        for (const [ingredientId, data] of requiredIngredients) {
          const ing = data.ingredient;

          // Hết nguyên liệu mà còn ly -> Báo hết hàng nguyên liệu
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

        // 3. Tạo Order và OrderItem trong transaction
        return await tx.order.create({
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
      size: item.size,
      toppings: item.toppings as unknown as PricedOption[],
      quantity: item.qty,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
  };
}