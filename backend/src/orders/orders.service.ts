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
   *
   * Cập nhật có điều kiện `status = trạng thái vừa đọc`: nếu một yêu cầu khác đổi trạng thái
   * xen giữa thì không ghi đè mà báo 409.
   *
   * @throws BadRequestException khi đích là PENDING/PAID/PAYMENT_FAILED: chỉ thanh toán mới được đặt (400)
   * @throws NotFoundException khi đơn không tồn tại (404)
   * @throws InvalidOrderTransitionException khi chuyển tiếp không có trong sơ đồ (409)
   * @throws ConflictException khi trạng thái vừa bị yêu cầu khác thay đổi (409)
   */
  async changeStatus(orderId: number, to: OrderStatus): Promise<OrderResponseDto> {
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

  /**
   * Tạo đơn ở trạng thái PENDING từ giỏ hàng đã validate (CreateOrderDto).
   * Giá luôn tính lại từ CSDL. Trừ kho đồng thời sử dụng Transaction kết hợp Optimistic Locking (Task 10 - TV4).
   *
   * @param userId id người đặt; `null` khi chưa có Auth (Task 7).
   * @throws NotFoundException khi có sản phẩm không tồn tại (404)
   * @throws BadRequestException khi size/topping không thuộc sản phẩm (400)
   * @throws ConflictException khi số lượng vượt tồn kho hoặc xung đột đồng thời (409)
   */
  async createPending(
    userId: number | null,
    dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    // Nếu phía client bị timeout sau khi server đã tạo đơn, trả lại đơn cũ.
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
        const products = new Map(
          (await tx.product.findMany({
            where: { id: { in: productIds } },
          })).map((p) => [p.id, p]),
        );

        const missing = productIds.filter((id) => !products.has(id));
        if (missing.length > 0) {
          throw new NotFoundException(
            `Không tìm thấy sản phẩm có id ${missing.join(', ')}`,
          );
        }

        // Cùng một sản phẩm có thể nằm ở nhiều dòng (khác size/topping): cộng dồn trước khi so tồn kho.
        const requested = new Map<number, number>();
        for (const item of dto.items) {
          requested.set(item.productId, (requested.get(item.productId) ?? 0) + item.quantity);
        }

        // Kiểm tra tồn kho và trừ kho bằng Optimistic Locking (Task 10 - TV4)
        for (const [productId, quantity] of requested) {
          const product = products.get(productId)!;
          if (quantity > product.stock) {
            throw new ConflictException(
              `"${product.name}" chỉ còn ${product.stock}, không đủ ${quantity}`,
            );
          }

          const updateResult = await tx.product.updateMany({
            where: {
              id: product.id,
              version: product.version, // Khóa lạc quan kiểm tra version
              stock: { gte: quantity },
            },
            data: {
              stock: { decrement: quantity },
              version: { increment: 1 }, // Tăng version để ngăn chặn ghi đè đồng thời
            },
          });

          if (updateResult.count === 0) {
            throw new ConflictException(
              `Xung đột tồn kho đối với sản phẩm "${product.name}" do có đơn hàng đồng thời. Vui lòng thử lại!`,
            );
          }
        }

        // Lấy lại sản phẩm đã được cập nhật kho để tính giá chính xác
        const freshProducts = new Map(
          (await tx.product.findMany({
            where: { id: { in: productIds } },
          })).map((p) => [p.id, p]),
        );

        const lines = dto.items.map((item) =>
          priceLine(freshProducts.get(item.productId) as any, item.size, item.toppings, item.quantity),
        );

        const promotion = applyVoucher(
          orderTotal(lines),
          dto.voucherCode,
        );

        // Tạo Order và OrderItem trong cùng transaction
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