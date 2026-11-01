import {
  Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus, Param,
  Post, UseGuards,
} from '@nestjs/common';
import { IsInt, Max, Min } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PositiveIntIdPipe } from '../common/pipes/positive-int-id.pipe';
import { MockPaymentDto } from './dto/mock-payment.dto';
import { PaymentsService } from './payments.service';
import { PayosService } from './payos.service';

class CreatePayosCheckoutDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  orderId!: number;
}

@Controller(['payments', 'api/payments'])
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly payosService: PayosService,
  ) {}

  /** Protected endpoint; amount is read from PostgreSQL, never from request JSON. */
  @Post('payos/create')
  @UseGuards(JwtAuthGuard)
  createPayos(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePayosCheckoutDto,
  ) {
    return this.payosService.createLink(user.id, dto.orderId);
  }

  /** Frontend may poll this status; it cannot set payment state. */
  @Get('payos/status/:id')
  @UseGuards(JwtAuthGuard)
  getPayosStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', PositiveIntIdPipe) id: number,
  ) {
    return this.payosService.status(user.id, id);
  }

  /** Public provider webhook, authenticated by HMAC-SHA256 signature instead of user JWT. */
  @Post('payos/webhook')
  @HttpCode(HttpStatus.OK)
  webhook(@Body() payload: unknown) {
    return this.payosService.webhook(payload);
  }

  private assertMockAllowed() {
    // Production real-money checkout must NEVER expose a mock-success endpoint.
    if (process.env.PAYMENT_MODE === 'payos') {
      throw new ForbiddenException('Mock payment đã bị vô hiệu hóa ở chế độ thanh toán thật.');
    }
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  pay(@CurrentUser() user: AuthenticatedUser, @Body() dto: MockPaymentDto) {
    this.assertMockAllowed();
    return this.paymentsService.mockPayment(user.id, dto);
  }

  @Post('mock')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  mock(@CurrentUser() user: AuthenticatedUser, @Body() dto: MockPaymentDto) {
    this.assertMockAllowed();
    return this.paymentsService.mockPayment(user.id, dto);
  }
}
