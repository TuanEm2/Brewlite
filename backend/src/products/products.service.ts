import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  PricedOption,
  ProductDetailDto,
  ProductSummaryDto,
} from './dto/product-response.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<ProductSummaryDto[]> {
    return this.prisma.product.findMany({
      select: { id: true, name: true, price: true, imageUrl: true },
      orderBy: { id: 'asc' },
    });
  }

  async findOne(id: number): Promise<ProductDetailDto> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        price: true,
        imageUrl: true,
        stock: true,
        sizes: true,
        toppings: true,
      },
    });
    if (!product) {
      throw new NotFoundException(`Không tìm thấy sản phẩm có id ${id}`);
    }
    return {
      ...product,
      sizes: product.sizes as unknown as PricedOption[],
      toppings: product.toppings as unknown as PricedOption[],
    };
  }
}
