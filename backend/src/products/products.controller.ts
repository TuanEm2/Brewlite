import { Controller, Get, Param } from '@nestjs/common';
import {
  ProductDetailDto,
  ProductSummaryDto,
} from './dto/product-response.dto';
import { PositiveIntIdPipe } from './positive-int-id.pipe';
import { ProductsService } from './products.service';

// Đề ghi `/products`; thêm `/api/products` để khớp prefix `api` của AppController.
@Controller(['products', 'api/products'])
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(): Promise<ProductSummaryDto[]> {
    return this.productsService.findAll();
  }

  @Get(':id')
  findOne(
    @Param('id', PositiveIntIdPipe) id: number,
  ): Promise<ProductDetailDto> {
    return this.productsService.findOne(id);
  }
}
