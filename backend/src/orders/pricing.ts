import { BadRequestException } from '@nestjs/common';
import { PricedOption } from '../products/dto/product-response.dto';

/** Phần thông tin sản phẩm cần để tính giá. */
export interface PricingProduct {
  id: number;
  name: string;
  price: number;
  sizes: PricedOption[];
  toppings: PricedOption[];
}

export interface PricedLine {
  productId: number;
  productName: string;
  size: string;
  toppings: PricedOption[];
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

/**
 * Tính giá một dòng phía server, không tin giá từ frontend.
 * Đơn giá = giá gốc + phụ thu size + tổng phụ thu topping; thành tiền = đơn giá × số lượng.
 */
export function priceLine(
  product: PricingProduct,
  sizeName: string,
  toppingNames: string[],
  quantity: number,
): PricedLine {
  const size = product.sizes.find((s) => s.name === sizeName);
  if (!size) {
    throw new BadRequestException(
      `Sản phẩm "${product.name}" không có size ${sizeName}`,
    );
  }
  if (new Set(toppingNames).size !== toppingNames.length) {
    throw new BadRequestException('Topping bị chọn lặp lại');
  }
  const toppings = toppingNames.map((name) => {
    const topping = product.toppings.find((t) => t.name === name);
    if (!topping) {
      throw new BadRequestException(
        `Sản phẩm "${product.name}" không có topping "${name}"`,
      );
    }
    return topping;
  });

  const unitPrice =
    product.price + size.price + toppings.reduce((sum, t) => sum + t.price, 0);
  return {
    productId: product.id,
    productName: product.name,
    size: size.name,
    toppings,
    quantity,
    unitPrice,
    lineTotal: unitPrice * quantity,
  };
}

export function orderTotal(lines: PricedLine[]): number {
  return lines.reduce((sum, line) => sum + line.lineTotal, 0);
}
