import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PricedOption,
  ProductDetailDto,
  ProductSummaryDto,
} from './dto/product-response.dto';

const SUMMARY_SELECT = {
  id: true,
  name: true,
  price: true,
  imageUrl: true,
} satisfies Prisma.ProductSelect;

// Không chọn `version`: cột nội bộ cho optimistic locking, frontend không cần.
const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  stock: true,
  sizes: true,
  toppings: true,
} satisfies Prisma.ProductSelect;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<ProductSummaryDto[]> {
    return this.prisma.product.findMany({
      select: SUMMARY_SELECT,
      orderBy: { id: 'asc' },
    });
  }

  async findOne(id: number): Promise<ProductDetailDto> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (!product) {
      throw new NotFoundException(`Không tìm thấy sản phẩm có id ${id}`);
    }
    return toDetail(product);
  }

  /**
   * TV4: công khai tồn nguyên liệu và số ly ước tính cho một lựa chọn size/topping.
   * Đọc dữ liệu kho hiện tại; khi đặt hàng OrdersService vẫn kiểm tra lại bằng transaction.
   */
  async ingredientAvailability(id: number, size: string, toppings: string[]) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true, name: true, sizes: true, toppings: true },
    });
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm.');
    const sizes = product.sizes as unknown as PricedOption[];
    const options = product.toppings as unknown as PricedOption[];
    if (!size || !sizes.some((item) => item.name === size)) {
      throw new BadRequestException('Size không hợp lệ.');
    }
    if (toppings.length > 20 || new Set(toppings).size !== toppings.length ||
        toppings.some((name) => !options.some((item) => item.name === name))) {
      throw new BadRequestException('Topping không hợp lệ.');
    }

    const rows = await this.prisma.productIngredient.findMany({
      where: { productId: id },
      include: { ingredient: true },
    });
    if (!rows.length) {
      return { productId: id, size, toppings, configured: false,
        maxCups: null, ingredients: [] };
    }

    // Bám đúng cách chọn công thức trong OrdersService.createPending().
    let baseRows = rows.filter((row) => row.size === size);
    if (!baseRows.length) baseRows = rows;
    let selectedRows = baseRows.filter((row) =>
      !row.topping || toppings.includes(row.topping));
    if (!selectedRows.length) selectedRows = baseRows;

    const needs = new Map<number, {
      id: number; name: string; unit: string; available: number; requiredForOne: number;
    }>();
    for (const row of selectedRows) {
      const amount = Number(row.quantity);
      if (amount <= 0) continue;
      const previous = needs.get(row.ingredientId);
      if (previous) {
        previous.requiredForOne += amount;
      } else {
        needs.set(row.ingredientId, {
          id: row.ingredientId,
          name: row.ingredient.name,
          unit: row.ingredient.unit,
          available: Number(row.ingredient.stock),
          requiredForOne: amount,
        });
      }
    }
    const ingredients = [...needs.values()].map((item) => ({
      ...item,
      maxCups: Math.max(0, Math.floor((item.available + 1e-9) / item.requiredForOne)),
    }));
    return {
      productId: id, size, toppings,
      configured: ingredients.length > 0,
      maxCups: ingredients.length
        ? Math.min(...ingredients.map((item) => item.maxCups))
        : null,
      ingredients,
    };
  }

  /** Lấy nhiều sản phẩm một lần để tính giá đơn hàng (Task 6). Id không tồn tại bị bỏ qua. */
  async findManyByIds(ids: number[]): Promise<ProductDetailDto[]> {
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: DETAIL_SELECT,
    });
    return products.map(toDetail);
  }
}

type DetailRow = Prisma.ProductGetPayload<{ select: typeof DETAIL_SELECT }>;

// `sizes`/`toppings` là cột Json; seed của TV2 bảo đảm dạng PricedOption[].
function toDetail(product: DetailRow): ProductDetailDto {
  return {
    ...product,
    sizes: product.sizes as unknown as PricedOption[],
    toppings: product.toppings as unknown as PricedOption[],
  };
}
