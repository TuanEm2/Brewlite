import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

type JsonObject = Record<string, unknown>;

export interface PayosLink {
  orderCode: number;
  amount: number;
  paymentLinkId: string;
  checkoutUrl: string;
}
export interface VerifiedPayosWebhook {
  orderCode: number;
  amount: number;
  paymentLinkId: string;
  reference: string;
  success: boolean;
}

function isRecord(input: unknown): input is JsonObject {
  return input !== null && typeof input === 'object' && !Array.isArray(input);
}

/** Canonical query string required by payOS webhook signature documentation. */
export function payosDataToSign(data: JsonObject): string {
  return Object.keys(data).sort().filter((key) => data[key] !== undefined).map((key) => {
    let value = data[key];
    if (Array.isArray(value)) {
      value = JSON.stringify(value.map((element) => {
        if (!isRecord(element)) return element;
        return Object.fromEntries(Object.entries(element).sort(([a], [b]) => a.localeCompare(b)));
      }));
    }
    if (value === null || value === undefined || value === 'null' || value === 'undefined') value = '';
    return key + '=' + String(value);
  }).join('&');
}

@Injectable()
export class PayosGateway {
  private config() {
    if (process.env.PAYMENT_MODE !== 'payos') {
      throw new ServiceUnavailableException('Thanh toán payOS chưa được bật.');
    }
    const clientId = process.env.PAYOS_CLIENT_ID;
    const apiKey = process.env.PAYOS_API_KEY;
    const checksumKey = process.env.PAYOS_CHECKSUM_KEY;
    if (!clientId || !apiKey || !checksumKey) {
      throw new ServiceUnavailableException('Thiếu cấu hình payOS ở Backend.');
    }
    return { clientId, apiKey, checksumKey };
  }

  private hash(value: string, key: string): string {
    return createHmac('sha256', key).update(value).digest('hex');
  }

  private async call(path: string, init?: { method: 'POST'; body: object }): Promise<JsonObject> {
    const { clientId, apiKey } = this.config();
    let response: Response;
    try {
      response = await fetch('https://api-merchant.payos.vn' + path, {
        method: init?.method ?? 'GET',
        headers: {
          'x-client-id': clientId,
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: init ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new ServiceUnavailableException('Không thể kết nối payOS; trạng thái thanh toán chưa xác định.');
    }
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok || !isRecord(payload) || payload.code !== '00' || !isRecord(payload.data)) {
      throw new ServiceUnavailableException('payOS chưa trả kết quả hợp lệ; kiểm tra lại trạng thái trước khi thử lại.');
    }
    return payload.data;
  }

  async createPaymentLink(data: {
    orderCode: number; amount: number; description: string; returnUrl: string; cancelUrl: string;
  }): Promise<PayosLink> {
    const { checksumKey } = this.config();
    const signature = this.hash(payosDataToSign(data), checksumKey);
    const body = await this.call('/v2/payment-requests', {
      method: 'POST', body: { ...data, signature },
    });
    if (body.orderCode !== data.orderCode || body.amount !== data.amount ||
        typeof body.checkoutUrl !== 'string' || typeof body.paymentLinkId !== 'string' ||
        !body.checkoutUrl.startsWith('https://')) {
      throw new ServiceUnavailableException('payOS trả về link thanh toán không hợp lệ.');
    }
    return {
      orderCode: data.orderCode, amount: data.amount,
      checkoutUrl: body.checkoutUrl, paymentLinkId: body.paymentLinkId,
    };
  }

  /** Recover provider checkout after a timeout; never request a second payment for the same order. */
  async getPaymentLink(orderCode: number): Promise<{ id: string; status: string; amount: number }> {
    const body = await this.call('/v2/payment-requests/' + encodeURIComponent(String(orderCode)));
    if (body.orderCode !== orderCode || typeof body.id !== 'string' ||
        typeof body.status !== 'string' || typeof body.amount !== 'number') {
      throw new ServiceUnavailableException('Không đối chiếu được giao dịch payOS.');
    }
    return { id: body.id, status: body.status, amount: body.amount };
  }

  verifyWebhook(input: unknown): VerifiedPayosWebhook {
    const { checksumKey } = this.config();
    if (!isRecord(input) || !isRecord(input.data) || typeof input.signature !== 'string' ||
        !/^[a-f0-9]{64}$/i.test(input.signature)) {
      throw new BadRequestException('Webhook payOS thiếu chữ ký hợp lệ.');
    }
    const expected = Buffer.from(this.hash(payosDataToSign(input.data), checksumKey), 'hex');
    const actual = Buffer.from(input.signature, 'hex');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new BadRequestException('Chữ ký webhook payOS không hợp lệ.');
    }
    const data = input.data;
    if (!Number.isSafeInteger(data.orderCode) || !Number.isSafeInteger(data.amount) ||
        typeof data.paymentLinkId !== 'string' || typeof data.reference !== 'string') {
      throw new BadRequestException('Webhook payOS thiếu trường giao dịch.');
    }
    if (data.currency !== undefined && data.currency !== 'VND') {
      throw new BadRequestException('Sai đơn vị tiền tệ.');
    }
    return {
      orderCode: data.orderCode as number, amount: data.amount as number,
      paymentLinkId: data.paymentLinkId, reference: data.reference,
      success: input.success === true && input.code === '00' && data.code === '00',
    };
  }
}
