import { Body, Controller, Post } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

@Controller(['orders', 'api/orders'])
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.createPending(null, dto); // TV6 sẽ thay 'null' bằng userId từ JWT ở Task 7 sau
  }
}