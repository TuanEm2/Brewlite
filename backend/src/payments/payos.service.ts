import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PayosGateway, VerifiedPayosWebhook } from './payos.gateway';

@Injectable()
export class PayosService {
  private readonly logger = new Logger(PayosService.name);
  constructor(private readonly prisma: PrismaService, private readonly gateway: PayosGateway) {}

  private returnBaseUrl(): string {
    const url = process.env.PAYOS_RETURN_BASE_URL;
    if (!url || !/^https:\/\//i.test(url)) {
      throw new ServiceUnavailableException('PAYOS_RETURN_BASE_URL phải là URL HTTPS của website.');
    }
    return url.replace(/\/+$/, '');
  }

  private orderCode(orderId: number): number {
    const prefix = Number(process.env.PAYOS_ORDER_CODE_PREFIX ?? '260000000');
    const code = prefix + orderId;
    if (!Number.isSafeInteger(prefix) || prefix < 100000000 || prefix > 1900000000 ||
        !Number.isSafeInteger(code) || code > 2147483647) {
      throw new ServiceUnavailableException('PAYOS_ORDER_CODE_PREFIX không hợp lệ.');
    }
    return code;
  }

  async createLink(userId: number, orderId: number) {
    if (process.env.PAYMENT_MODE !== 'payos') {
      throw new ServiceUnavailableException('Chưa bật thanh toán thật.');
    }
    const baseUrl = this.returnBaseUrl();

    const { checkout, isNew } = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT "id" FROM "Order" WHERE "id" = ${orderId} AND "userId" = ${userId} FOR UPDATE
      `;
      if (!locked.length) throw new NotFoundException('Không tìm thấy đơn của bạn.');
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.PAYMENT_FAILED) {
        throw new ConflictException('Đơn không ở trạng thái chờ thanh toán.');
      }
      const saved = await tx.payosCheckout.findUnique({ where: { orderId } });
      if (saved) {
        if (saved.amount !== order.total) throw new ConflictException('Số tiền đơn đã thay đổi.');
        return { checkout: saved, isNew: false };
      }
      const created = await tx.payosCheckout.create({
        data: { orderId, orderCode: this.orderCode(orderId), amount: order.total },
      });
      return { checkout: created, isNew: true };
    });

    if (checkout.checkoutUrl) {
      return {
        orderId, orderCode: checkout.orderCode, amount: checkout.amount,
        checkoutUrl: checkout.checkoutUrl, status: checkout.status,
      };
    }

    // Never make a second create call if the first might already have reached payOS.
    if (!isNew) {
      const existing = await this.gateway.getPaymentLink(checkout.orderCode);
      if (existing.amount !== checkout.amount || existing.status !== 'PENDING' ||
          !/^[a-zA-Z0-9-]+$/.test(existing.id)) {
        throw new ConflictException('Link đã tồn tại ở payOS; cần đối soát trạng thái.');
      }
      const checkoutUrl = 'https://pay.payos.vn/web/' + existing.id;
      await this.prisma.payosCheckout.updateMany({
        where: { orderId, status: 'CREATING' },
        data: { checkoutUrl, paymentLinkId: existing.id, status: 'PENDING' },
      });
      return { orderId, orderCode: checkout.orderCode, amount: checkout.amount, checkoutUrl, status: 'PENDING' };
    }

    const link = await this.gateway.createPaymentLink({
      orderCode: checkout.orderCode,
      amount: checkout.amount,
      description: 'BL' + String(orderId),
      returnUrl: baseUrl + '/checkout/' + String(orderId),
      cancelUrl: baseUrl + '/checkout/' + String(orderId),
    });
    await this.prisma.payosCheckout.updateMany({
      where: { orderId, status: 'CREATING' },
      data: { checkoutUrl: link.checkoutUrl, paymentLinkId: link.paymentLinkId, status: 'PENDING' },
    });
    return {
      orderId, orderCode: checkout.orderCode, amount: checkout.amount,
      checkoutUrl: link.checkoutUrl, status: 'PENDING',
    };
  }

  async status(userId: number, orderId: number) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { id: true, status: true, total: true, payosCheckout: true },
    });
    if (!order) throw new NotFoundException('Không tìm thấy đơn của bạn.');
    return {
      orderId: order.id, status: order.status, amount: order.total,
      checkoutUrl: order.payosCheckout?.checkoutUrl ?? null,
      providerStatus: order.payosCheckout?.status ?? null,
    };
  }

  /** No redirect query parameter is trusted as proof of payment. */
  async webhook(input: unknown) {
    const event: VerifiedPayosWebhook = this.gateway.verifyWebhook(input);
    if (!event.success) return { received: true, ignored: true };

    if (!event.reference.trim()) throw new BadRequestException('Webhook thiếu mã giao dịch ngân hàng.');
    const mapped = await this.prisma.payosCheckout.findUnique({ where: { orderCode: event.orderCode } });
    if (!mapped) {
      this.logger.warn('Signed webhook with unknown orderCode (possibly payOS confirmation sample).');
      return { received: true, ignored: true };
    }
    if (mapped.amount !== event.amount ||
        (mapped.paymentLinkId && mapped.paymentLinkId !== event.paymentLinkId)) {
      this.logger.error('payOS webhook amount or link mismatch. Reconciliation required.');
      throw new BadRequestException('Số tiền hoặc mã link thanh toán không khớp.');
    }

    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT "id" FROM "Order" WHERE "id" = ${mapped.orderId} FOR UPDATE
      `;
      if (!locked.length) throw new NotFoundException('Đơn đã bị xóa; cần đối soát giao dịch.');
      const order = await tx.order.findUniqueOrThrow({ where: { id: mapped.orderId } });
      const uniqueKey = 'payos:' + event.reference;
      const previous = await tx.payment.findUnique({ where: { orderId: order.id } });

      if (order.status === OrderStatus.PAID && previous?.idempotencyKey === uniqueKey) {
        return { received: true, replayed: true };
      }
      if (previous || order.status === OrderStatus.PAID ||
          (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.PAYMENT_FAILED)) {
        this.logger.error('Real payment for an order in a conflicting state: manual reconciliation.');
        throw new ConflictException('Đơn không thể tự ghi nhận thanh toán; cần đối soát.');
      }
      if (order.total !== event.amount || mapped.amount !== order.total) {
        throw new BadRequestException('Số tiền webhook khác tổng tiền đơn.');
      }
      if (!order.userId) throw new ConflictException('Đơn không có chủ sở hữu.');

      await tx.payment.create({
        data: { orderId: order.id, idempotencyKey: uniqueKey, amount: order.total, method: 'PAYOS_VIETQR' },
      });
      await tx.paymentAttempt.create({
        data: {
          orderId: order.id, idempotencyKey: uniqueKey, amount: order.total,
          method: 'PAYOS_VIETQR', outcome: 'SUCCESS',
        },
      });
      await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.PAID } });
      await tx.user.update({
        where: { id: order.userId },
        data: { loyaltyPoints: { increment: Math.floor(order.total / 10000) } },
      });
      await tx.payosCheckout.update({
        where: { orderId: order.id },
        data: { status: 'PAID', paymentLinkId: event.paymentLinkId },
      });
      return { received: true, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }
}
