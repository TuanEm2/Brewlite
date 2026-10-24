import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MockPaymentDto } from './dto/mock-payment.dto';
import { PaymentsService } from './payments.service';

@Controller(['payments', 'api/payments'])
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('mock')
  @HttpCode(HttpStatus.OK)
  mock(@CurrentUser() user: AuthenticatedUser, @Body() dto: MockPaymentDto) {
    return this.paymentsService.mockPayment(user.id, dto);
  }
}
