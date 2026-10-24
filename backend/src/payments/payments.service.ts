import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { paymentTransitionPath } from '../orders/order-state';
import { PrismaService } from '../prisma/prisma.service';
import { MockPaymentDto } from './dto/mock-payment.dto';

export interface MockPaymentResponse {
  orderId: number;
  status: 'PAID' | 'PAYMENT_FAILED';
  outcome: 'SUCCESS' | 'FAILURE';
  amount: number;
  method: MockPaymentDto['method'];
  idempotencyKey: string;
  replayed: boolean;
  message: string;
}

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mô phỏng thanh toán trong một giao dịch PostgreSQL.
   * FOR UPDATE tuần tự hóa hai yêu cầu thanh toán CÙNG ĐƠN để không bị trả tiền hai lần.
   * Các lần thử SUCCESS/FAILURE đều được ghi lại bằng idempotencyKey duy nhất.
   * Không trừ kho ở Task 8: TV4 bổ sung quy tắc tồn kho/transaction ở Task 10.
   */
  async mockPayment(userId: number, dto: MockPaymentDto): Promise<MockPaymentResponse> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Khóa theo order, và chỉ cho chủ đơn truy cập (không rò rỉ đơn người khác).
        const locked = await tx.$queryRaw<Array<{ id: number }>>`
          SELECT "id" FROM "Order"
          WHERE "id" = ${dto.orderId} AND "userId" = ${userId}
          FOR UPDATE
        `;
        if (locked.length === 0) throw new NotFoundException('Không tìm thấy đơn hàng.');

        const order = await tx.order.findUniqueOrThrow({ where: { id: dto.orderId } });
        const previous = await tx.paymentAttempt.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
        });

        if (previous) {
          // Khóa chống tái sử dụng key với payload khác hoặc đơn thuộc người khác.
          if (
            previous.orderId !== order.id ||
            previous.method !== dto.method ||
            previous.outcome !== dto.outcome
          ) {
            throw new ConflictException('Idempotency key đã được dùng cho yêu cầu khác.');
          }
          return toResponse(previous.orderId, previous.outcome as MockPaymentDto['outcome'],
            previous.amount, previous.method as MockPaymentDto['method'],
            previous.idempotencyKey, true);
        }

        // Một đơn chỉ thanh toán thành công một lần.
        if (order.status === OrderStatus.PAID || await tx.payment.findUnique({ where: { orderId: order.id } })) {
          throw new ConflictException('Đơn hàng đã thanh toán.');
        }

        // Task 10 (TV3): đổi trạng thái qua máy trạng thái. PAYMENT_FAILED đi "thử lại" về PENDING
        // rồi mới tới đích; trạng thái khác (CANCELLED, PREPARING…) bị chặn với 409.
        const target = dto.outcome === 'SUCCESS' ? OrderStatus.PAID : OrderStatus.PAYMENT_FAILED;
        paymentTransitionPath(order.status, target);

        if (dto.outcome === 'SUCCESS') {
          await tx.payment.create({
            data: {
              orderId: order.id,
              idempotencyKey: dto.idempotencyKey,
              amount: order.total,
              method: dto.method,
            },
          });
        }
        // Đơn đang bị khóa FOR UPDATE: bước "thử lại" về PENDING (đã kiểm tra ở trên) và bước đích
        // nằm trong cùng transaction, nên chỉ cần ghi trạng thái đích.
        await tx.order.update({
          where: { id: order.id },
          data: { status: target },
        });

        await tx.paymentAttempt.create({
          data: {
            orderId: order.id,
            idempotencyKey: dto.idempotencyKey,
            amount: order.total,
            method: dto.method,
            outcome: dto.outcome,
          },
        });

        return toResponse(order.id, dto.outcome, order.total, dto.method,
          dto.idempotencyKey, false);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034')) {
        throw new ConflictException('Yêu cầu thanh toán đồng thời bị xung đột, hãy thử lại cùng idempotencyKey.');
      }
      throw error;
    }
  }
}

function toResponse(
  orderId: number,
  outcome: MockPaymentDto['outcome'],
  amount: number,
  method: MockPaymentDto['method'],
  idempotencyKey: string,
  replayed: boolean,
): MockPaymentResponse {
  return {
    orderId,
    status: outcome === 'SUCCESS' ? 'PAID' : 'PAYMENT_FAILED',
    outcome,
    amount,
    method,
    idempotencyKey,
    replayed,
    message: outcome === 'SUCCESS'
      ? 'Thanh toán mô phỏng thành công (không thu tiền thật).'
      : 'Thanh toán mô phỏng thất bại. Có thể thử lại bằng khóa mới.',
  };
}
