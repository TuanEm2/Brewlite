# Sprint 3 — TV5: Voucher, loyalty và lịch sử đơn

## Chức năng

### Voucher
- POST /orders nhận voucherCode không bắt buộc.
- Quy tắc demo: BREW10 giảm 10%, đơn tối thiểu 50.000đ,
  giảm tối đa 20.000đ; tiền giảm làm tròn xuống số nguyên VND.
- Mã được trim và chuyển thành chữ hoa.
- Backend tự tính giá, lưu voucherCode, discount và total.
- Voucher sai bị từ chối; transaction rollback cả thay đổi tồn kho.
- Cùng idempotency key nhưng đổi voucher bị từ chối bằng 409.
- Đây là quy tắc demo do TV5 lựa chọn, không phải mức giảm
  cụ thể bắt buộc trong đề giảng viên.

### Loyalty
- Mỗi 10.000đ thực trả sau giảm giá được 1 điểm, làm tròn xuống.
- Chỉ cộng khi thanh toán thành công và đơn chuyển PAID.
- Cộng điểm trong cùng transaction với thanh toán.
- Tận dụng khóa đơn FOR UPDATE, Payment duy nhất theo orderId
  và kiểm tra idempotency để chống cộng trùng.
- Thanh toán thất bại không cộng điểm.
- Chưa triển khai hoàn điểm khi hủy đơn đã thanh toán.

### Lịch sử đơn
- GET /orders/me và GET /api/orders/me yêu cầu JWT hợp lệ.
- Chỉ trả đơn thuộc ID người dùng lấy từ token đã xác thực.
- Đơn mới nhất trước; chưa có đơn trả [].
- Có voucherCode, discount, total và items trong phản hồi.
- Chưa phân trang.

## Kiểm thử trên máy TV5
- Typecheck frontend/backend: đạt.
- npm test: đạt.
- npm run test:e2e: đạt.
- Build: đạt.
- Voucher: công thức, mức tối thiểu, mức giảm tối đa,
  rollback tồn kho và chống đổi voucher khi dùng lại key.
- Loyalty: thất bại, thử lại, replay và hai thanh toán đồng thời.
- Lịch sử: đúng chủ đơn, thứ tự, mảng rỗng, thiếu/sai token,
  không cho đổi chủ đơn qua query userId.

## Tích hợp mã nguồn
- Merge commit nền: fb79916.
- Giữ lịch sử TV3 và phần tồn kho TV4.
- Cập nhật test tồn kho cũ cho nghiệp vụ trừ kho khi tạo PENDING.
- Sửa test đồng thời để dọn dữ liệu và đóng kết nối.
- Chức năng TV5 không yêu cầu migration mới ngoài bản kế thừa.
- Không chạy seed/reset trên database có dữ liệu cần giữ.

## TV6 cần làm tiếp
- Tích hợp ô nhập voucher và gửi voucherCode khi tạo đơn.
- Nếu giỏ hoặc voucher thay đổi, dùng idempotency key mới;
  nếu thử lại cùng yêu cầu do lỗi mạng, giữ nguyên key.
- Hiển thị giảm giá và tổng phải trả từ phản hồi backend.
- Tích hợp màn hình xác nhận/lịch sử với GET /orders/me.
- Giữ cơ chế xác thực JWT hiện có.
- Thực hiện Docker Compose, README và demo end-to-end theo phân công.
- Kiểm tra lại toàn luồng Menu → Cart → Auth → Order → Payment → History.

## Giới hạn
- Voucher hiện là một mã demo cố định, chưa có quản trị,
  ngày hết hạn hoặc giới hạn số lượt sử dụng.
- Test đạt không đồng nghĩa toàn dự án đã hết mọi lỗi.
- Npm từng báo 6 cảnh báo high ở Sprint 2; chưa xác nhận
  chúng đã được xử lý trong bản Sprint 3.