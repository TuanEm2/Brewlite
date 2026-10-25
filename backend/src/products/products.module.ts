import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService],
  // Export để module đơn hàng (Task 6) tra giá sản phẩm phía server.
  exports: [ProductsService],
})
export class ProductsModule {}
