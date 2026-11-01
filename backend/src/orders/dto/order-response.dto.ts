import { OrderStatus } from '@prisma/client';
import { PricedOption } from '../../products/dto/product-response.dto';

export interface OrderItemResponseDto {
  id: number;
  productId: number;
  /** Tên đồ uống tại thời điểm đặt (in trên hóa đơn). */
  productName: string;
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
