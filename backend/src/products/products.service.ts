import { Injectable, NotFoundException } from '@nestjs/common';
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
