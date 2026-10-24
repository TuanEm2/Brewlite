import { OrderStatus } from '@prisma/client';
import { PricedOption } from '../../products/dto/product-response.dto';

export interface OrderItemResponseDto {
  id: number;
  productId: number;
  size: string;
  toppings: PricedOption[];
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderResponseDto {
  /** Mã đơn trả cho khách. */
  id: number;
  status: OrderStatus;
  total: number;
  discount: number;
  createdAt: Date;
  items: OrderItemResponseDto[];
  voucherCode: string | null;
}
