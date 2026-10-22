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
    // `sizes`/`toppings` là cột Json; seed của TV2 bảo đảm dạng PricedOption[].
    return {
      ...product,
      sizes: product.sizes as unknown as PricedOption[],
      toppings: product.toppings as unknown as PricedOption[],
    };
  }
}
