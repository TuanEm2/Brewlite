import { Controller, Get, Param } from '@nestjs/common';
import { PositiveIntIdPipe } from '../common/pipes/positive-int-id.pipe';
import {
  ProductDetailDto,
  ProductSummaryDto,
} from './dto/product-response.dto';
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
