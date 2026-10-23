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
    const order = await this.prisma.order.create({
      data: {
        userId,
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
    return toResponse(order);
  }
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
