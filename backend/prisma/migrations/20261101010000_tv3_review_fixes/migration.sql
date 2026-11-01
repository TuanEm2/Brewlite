-- TV3 (sửa lỗi sau review). Chỉ thêm cột cho phép NULL; không đổi dữ liệu cũ.
-- Đánh dấu đơn bị hủy vì quá hạn thanh toán, để giao diện không nhầm với đơn khách tự hủy.
ALTER TABLE "Order" ADD COLUMN "paymentExpiredAt" TIMESTAMP(3);
-- Mã giao dịch ngân hàng đã ghi nhận cho link payOS, để phát hiện lần chuyển tiền thứ hai.
ALTER TABLE "PayosCheckout" ADD COLUMN "bankReference" TEXT;
