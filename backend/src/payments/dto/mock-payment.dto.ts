import { IsIn, IsInt, IsUUID, Max, Min } from 'class-validator';

/** Thanh toán mô phỏng: không kết nối ngân hàng, không thu tiền thật. */
export class MockPaymentDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  orderId!: number;

  @IsIn(['MOCK_QR', 'MOCK_CARD'])
  method!: 'MOCK_QR' | 'MOCK_CARD';

  @IsIn(['SUCCESS', 'FAILURE'])
  outcome!: 'SUCCESS' | 'FAILURE';

  /** Dùng lại chính khóa này khi retry vì timeout. Khóa mới = lần thử mới. */
  @IsUUID('4')
  idempotencyKey!: string;
}
