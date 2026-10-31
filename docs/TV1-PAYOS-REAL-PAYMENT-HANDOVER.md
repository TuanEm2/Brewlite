# TV1: payOS thanh toán thật trên source TV4

Base: feature/tv04, commit e4d8e166158983a963079655729776e214ad5a11.
Nhánh sửa: feature/tv01-payos-from-tv04. Không ghi đè nhánh TV4.

## Đã triển khai

- Thêm Prisma model PayosCheckout và migration theo dõi mỗi link/mã thanh toán gắn với một Order.
- POST /payments/payos/create (JWT): server xác minh chủ đơn, đọc số tiền ở PostgreSQL, tạo link payOS. Không nhận số tiền từ frontend.
- GET /payments/payos/status/:id (JWT): frontend đọc trạng thái và số tiền. Không thể đánh dấu PAID bằng API này.
- POST /payments/payos/webhook (công khai): xác minh chữ ký HMAC-SHA256 theo tài liệu payOS; đối chiếu orderCode, amount, paymentLinkId, reference. Chỉ cập nhật PAID cùng Payment, PaymentAttempt và điểm thưởng trong transaction sau khi webhook hợp lệ.
- Khi PAYMENT_MODE=payos thì POST /payments và /payments/mock bị chặn bằng 403, tránh giả lập thanh toán thành công trên sản phẩm thật.
- Đơn đã tạo payOS checkout không thể hủy từ website trước khi nhóm xây dựng luồng hủy link/đối soát/hoàn tiền thật.
- Checkout giao diện tối thiểu chuyển sang trang thanh toán payOS và định kỳ đọc trạng thái từ Backend. Redirect của khách không dùng làm bằng chứng thanh toán.
- Giữ nguyên logic tồn nguyên liệu TV4. Khi thanh toán không trừ nguyên liệu một lần nữa.

## Cấu hình

Tài khoản nhận tiền phải được xác thực chính chủ hoặc do người đại diện đủ điều kiện quản lý. Không dùng thông tin của người khác hoặc vượt qua bước xác thực.

Trong root .env (Docker Compose), sử dụng:

    PAYMENT_MODE=payos
    PAYOS_CLIENT_ID=<your-server-secret>
    PAYOS_API_KEY=<your-server-secret>
    PAYOS_CHECKSUM_KEY=<your-server-secret>
    PAYOS_RETURN_BASE_URL=https://your-public-brewlite-website.example
    PAYOS_ORDER_CODE_PREFIX=260000000

Giữ JWT_SECRET và POSTGRES_PASSWORD hợp lệ như trước. Không commit các secret thật vào GitHub.

PAYOS_RETURN_BASE_URL phải là URL HTTPS public của frontend; không dùng localhost. Backend cần HTTPS public proxy forward webhook URL, ví dụ https://your-api.example/payments/payos/webhook. Docker hiện bind port backend vào 127.0.0.1:4000, do đó cần reverse proxy HTTPS hoặc triển khai bên ngoài.

FRONTEND_URL của Backend phải khớp origin frontend HTTPS để CORS hoạt động.

Order-code prefix là số nguyên duy nhất cho merchant channel này (100000000..1900000000), không được đổi sau khi đã có checkout records; prefix + order ID phải <= 2147483647.

Đăng ký webhook tại payOS Dashboard hoặc API confirm-webhook. Lúc xác nhận payOS có thể gửi một mẫu webhook được ký hợp lệ, không tương ứng Order thực tế; Backend nhận nhưng không ghi Payment.

Chạy migration bằng: npm run prisma:deploy -w @brewlite/backend
Khởi động Docker: docker compose up --build -d

KHÔNG chạy prisma seed trên DB thật: seed của dự án TRUNCATE dữ liệu.

## API contract

- POST /payments/payos/create, header Authorization Bearer JWT, body JSON gồm orderId là number. Trả orderId, orderCode, amount, checkoutUrl, status.
- GET /payments/payos/status/:id, header Authorization Bearer JWT. Trả orderId, status, amount, checkoutUrl, providerStatus.
- POST /payments/payos/webhook: nhận JSON do payOS gửi, không yêu cầu JWT khách mà xác minh signature. Fake hoặc sửa amount sẽ bị HTTP 400.
- GET /orders/:id để đọc thông tin đơn của chính chủ cũng vẫn hoạt động.
- /api/payments/... aliases cũng hoạt động.

## Điều kiện triển khai tiền thật

1. Cần merchant payOS hợp lệ, tài khoản ngân hàng nhận tiền, HTTPS công khai, DNS và webhook đăng ký thật.
2. Chưa kiểm thử giao dịch có tiền thật; CI chỉ kiểm tra code, migration và test tự động.
3. Chưa có quy trình hoàn tiền hoặc hủy link thanh toán; khi có link, Backend ngăn hủy đơn. Trường hợp chuyển tiền ngoài trạng thái hợp lệ cần đối soát thủ công.
4. Khi Provider timeout ở bước tạo link, orderCode được giữ trong DB; yêu cầu sau cố gắng khôi phục link thay vì tạo trùng.
5. Mỗi Payment được xác nhận duy nhất một lần. Nếu người mua thực tế chuyển tiền hai lần, cần đối soát ngoài hệ thống để không nhầm với lỗi Idempotency.
6. Nếu payOS trả lời chưa rõ, không tự đánh dấu PAID; chỉ webhook đã xác minh mới cập nhật Order.
7. Không tự mở public môi trường có secret nếu chưa kiểm tra quy trình vận hành và bảo mật.

## Tài liệu chính thức

https://payos.vn/docs/api/
https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/
https://payos.vn/docs/moi-truong-test/
