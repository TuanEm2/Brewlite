import { Controller, Get, Param, Query } from '@nestjs/common';
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

  /** TV4: khách xem số lượng nguyên liệu còn lại cho size và topping đang chọn. */
  @Get(':id/availability')
  ingredientAvailability(
    @Param('id', PositiveIntIdPipe) id: number,
    @Query('size') size: string,
    @Query('topping') topping?: string | string[],
  ) {
    const toppings = topping === undefined ? [] : Array.isArray(topping) ? topping : [topping];
    return this.productsService.ingredientAvailability(id, size, toppings);
  }

  @Get(':id')
  findOne(
    @Param('id', PositiveIntIdPipe) id: number,
  ): Promise<ProductDetailDto> {
    return this.productsService.findOne(id);
  }
}
