# TV3 — timeout, hết hạn và đồng bộ payOS

Nhánh: feature/tv03-payos-followup. Tiếp nối commit c84c712 từ bản bàn giao integration/payos-team-handoff. Nhánh bàn giao để review; chưa deploy.

## Phương án và thay đổi

- Tên nước là snapshot OrderItem.productName tại thời điểm đặt. Migration c84c712 điền tên cho dòng đơn cũ. Lịch sử, checkout mock và checkout VietQR thật dùng snapshot, nên đổi tên sản phẩm sau này không làm đổi hóa đơn cũ.
- Mặc định giữ đơn 15 phút từ createdAt; cấu hình ORDER_PAYMENT_TTL_MINUTES (2–1440). Không thay TTL khi còn đơn chờ vì hạn được tính từ cấu hình hiện tại. Link mới gửi expiredAt dạng Unix giây; HMAC chỉ ký amount, cancelUrl, description, orderCode, returnUrl theo tài liệu payOS.
- status kiểm tra chủ đơn trước khi gọi payOS; gom request đang chạy và giới hạn đồng bộ cùng đơn 10 giây/lần mỗi process. Tạo link kiểm tra lại trạng thái và hạn dưới khóa Order FOR UPDATE.
- Nếu payOS PAID và amountPaid khớp tổng: ghi Payment/PaymentAttempt, trạng thái và điểm trong cùng transaction, dùng chung với webhook. Idempotency theo paymentLinkId và khóa đơn chống webhook/poll/worker ghi trùng. Chấp nhận replay giao dịch đã ghi trước followup.
- Nếu link còn PENDING và đơn quá hạn, chỉ hủy khi chưa có tiền vào; sau lệnh hủy phải GET lại. Nếu thanh toán thắng cuộc đua, ghi PAID. Chỉ CANCELLED/EXPIRED và amountPaid=0 mới hủy đơn/hoàn snapshot nguyên liệu.
- Lỗi mạng, kết quả chưa rõ, số tiền sai hoặc chuyển thiếu: giữ đơn/kho để retry hoặc đối soát; không suy đoán thanh toán thất bại. CREATING trong 30 giây được giữ để request tạo link hoàn tất. Không tạo lại link sau timeout có thể đã tới nhà cung cấp.
- Worker chạy mỗi 30 giây, 25 đơn/lượt, duyệt theo cursor để không kẹt ở nhóm đơn cũ; không chạy chồng trong một process. NODE_ENV=test hoặc ORDER_EXPIRY_WORKER_ENABLED=false tắt worker. Khóa database bảo vệ ghi nhận/hoàn kho giữa nhiều process.
- Checkout thật hiển thị tên nước, đếm ngược, khóa nút khi hết thời gian, chờ backend đối soát thay vì tự kết luận hủy. Thông báo lỗi đồng bộ khi polling thất bại.

## Kiểm thử

Unit test: timeout, hủy chưa xác nhận, link hết hạn, thanh toán thắng hủy, chuyển thiếu, sai link/số tiền, ownership, coalescing, webhook replay và chữ ký expiredAt.
E2E mới dùng PostgreSQL local và gateway giả lập: tên nước giữ nguyên sau đổi tên sản phẩm; hai yêu cầu hết hạn chỉ hoàn kho một lần; giao dịch có link không được hoàn kho khi chưa xác nhận; sync/webhook đồng thời chỉ có một payment/attempt/lần cộng điểm. Không gọi payOS thật.

Chạy: npm run typecheck; npm test; npm run build; npm run test:e2e.

## Bàn giao / giới hạn

- Không đổi quyền hủy đơn đã trả của mock (phần TV5); đơn có payOS checkout vẫn bị chặn ở đường hủy của khách.
- CREATING mà payOS không tìm thấy sau timeout: giữ lại để đối soát, không tự giải phóng kho do chưa có kết luận đủ chắc chắn. Worker ghi orderId cần kiểm tra. Khi vận hành nhiều đơn/máy, nên bổ sung hàng đợi và lịch retry lưu DB; cooldown hiện tại ở RAM mỗi instance.
- Chưa xác minh live bằng khóa payOS thật, chưa chuyển tiền thật hoặc thay đổi môi trường production.
- Áp dụng migration productName bằng quy trình deploy của TV1; không reset DB. Test e2e chỉ trên DB thử nghiệm.
- Tài liệu provider: https://payos.vn/docs/api/ (expiredAt, 5 trường ký, GET và cancel link).

## Kết quả xác minh

- Typecheck toàn dự án: đạt. Build backend và frontend: đạt.
- Unit test sau sửa nội bộ: 187/187 đạt (16 suites), gồm 18 test mới so với bản bàn giao ban đầu.
- 82 e2e cũ đạt; 3 e2e TV3 mới đạt ở lần chạy riêng sau khi sửa fixture theo schema. Lần chạy toàn bộ ban đầu báo lỗi biên dịch fixture mới (đã sửa), không phải lỗi runtime ứng dụng.
- Các kiểm thử không dùng API keys/thanh toán thật.

## Sửa nội bộ sau review — giữ tương thích với nhóm

- Kiểm tra cấu hình payOS trước khi tạo bản ghi CREATING. Lỗi thiếu cấu hình không giữ lại checkout mới; sau khi sửa cấu hình, cùng đơn có thể thử tạo link lần đầu.
- Cache đồng bộ lưu cả thành công và thất bại. Trong cooldown, vẫn trả lỗi trước đó cho đơn còn chờ để frontend hiện tại không xóa nhầm cảnh báo; không gọi provider liên tục. Nếu webhook đã đổi đơn sang trạng thái đã thanh toán, trạng thái mới được trả ngay.
- Không thêm/sửa endpoint hoặc trường response; không thay schema/migration, TTL, frontend, hoàn kho, voucher hay cách cộng điểm. Chỉ sửa gateway/service và test payOS.
- Chưa xử lý tự động bản ghi CREATING đã kẹt từ trước hoặc request có thể đã gửi tới provider; vẫn giữ quy tắc đối soát để tránh tạo giao dịch trùng. Hạn cố định trong DB và đếm ngược theo giờ server được hoãn vì cần phối hợp TV1/TV2.

- Xác minh sau sửa nội bộ: typecheck toàn dự án, build backend và 3 e2e TV3 đạt; test thử lại sau sửa cấu hình cũng đạt.
