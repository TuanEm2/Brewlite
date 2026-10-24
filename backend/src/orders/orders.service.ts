import {
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
import { orderTotal, priceLine } from './pricing';

const ORDER_INCLUDE = { items: { orderBy: { id: 'asc' } } } satisfies Prisma.OrderInclude;
type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
  ) {}

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
   * Tạo đơn ở trạng thái PENDING từ giỏ hàng đã validate (CreateOrderDto).
   * Giá luôn tính lại từ CSDL. Chỉ kiểm tra tồn kho, không trừ kho:
   * trừ kho có khóa lạc quan thuộc Task 10 (TV4).
   *
   * @param userId id người đặt; `null` khi chưa có Auth (Task 7).
   * @throws NotFoundException khi có sản phẩm không tồn tại (404)
   * @throws BadRequestException khi size/topping không thuộc sản phẩm (400)
   * @throws ConflictException khi số lượng vượt tồn kho (409)
   */
  async createPending(
    userId: number | null,
    dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    // Nếu phía client bị timeout sau khi server đã tạo đơn, trả lại đơn cũ.
    // Chặn việc dùng lại cùng khóa cho giỏ hàng khác hoặc người dùng khác.
    if (dto.idempotencyKey) {
      const previous = await this.prisma.order.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: ORDER_INCLUDE,
      });
      if (previous) return replayExistingOrder(previous, userId, dto);
    }

    const productIds = [...new Set(dto.items.map((item) => item.productId))];
    const products = new Map(
      (await this.productsService.findManyByIds(productIds)).map((p) => [p.id, p]),
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
    for (const [productId, quantity] of requested) {
      const product = products.get(productId)!;
      if (quantity > product.stock) {
        throw new ConflictException(
          `"${product.name}" chỉ còn ${product.stock}, không đủ ${quantity}`,
        );
      }
    }

    const lines = dto.items.map((item) =>
      priceLine(products.get(item.productId)!, item.size, item.toppings, item.quantity),
    );

    // Tạo lồng nhau: Prisma ghi Order và mọi OrderItem trong cùng một transaction.
    let order: OrderWithItems;
    try {
      order = await this.prisma.order.create({
      data: {
        userId,
        idempotencyKey: dto.idempotencyKey,
        status: OrderStatus.PENDING,
        total: orderTotal(lines),
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
    } catch (error: unknown) {
      // Hai POST đồng thời dùng cùng key: unique index cho phép chỉ 1 bản ghi.
      // Sau khi request kia commit, trả lại kết quả cũ nếu payload giống nhau.
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
