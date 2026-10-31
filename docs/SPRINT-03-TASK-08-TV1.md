# BrewLite — Sprint 3 / TV1 — Mock Payment + Idempotency

## Phạm vi thực hiện

Được phát triển **trực tiếp từ file tổng hợp Sprint 2 của TV6**, không đẩy lên GitHub.
Giữ nguyên những phần Menu, giỏ hàng, đăng nhập JWT, tạo đơn PENDING của Sprint 1–2.

### Tính năng đã triển khai

1. API `POST /payments/mock` (cả `/api/payments/mock`), yêu cầu Bearer JWT. Chỉ xử lý đơn của chủ sở hữu.
2. Hai phương thức thanh toán **giả lập** `MOCK_QR` và `MOCK_CARD` (không thu tiền thật, không nhận thông tin thẻ).
3. Giả lập `SUCCESS` → tạo đúng một `Payment` với số tiền **lấy từ database**, cập nhật Order → `PAID`.
4. Giả lập `FAILURE` → cập nhật Order → `PAYMENT_FAILED`, **không tạo Payment thành công**; hỗ trợ thử lại.
5. Bảng mới `PaymentAttempt` ghi cả thành công/thất bại; unique `idempotencyKey` ngăn xử lý lại cùng một yêu cầu.
6. PostgreSQL `SELECT … FOR UPDATE` trong Prisma interactive transaction để khóa thanh toán trên cùng một đơn khi nhiều request đồng thời.
7. Khóa idempotency cho **tạo đơn** bằng trường `Order.idempotencyKey` đã có từ Sprint 2. Cùng người dùng + cùng món + cùng key trả đơn cũ; payload hoặc user khác → 409.
8. `GET /orders/:id` cho phép người dùng xem lại đơn của **chính mình**, phục vụ trang thanh toán.
9. Trang thử thanh toán tại `/checkout/[id]`; thêm link từ thông báo tạo đơn `PENDING` ở `/cart` đến trang này.
10. Test Jest bổ sung cho thanh toán và tạo đơn chống trùng.

**TV2 vẫn có thể thay giao diện checkout prototype**; **TV4 phụ trách quản lý/trừ tồn kho bằng transaction ở Task 10**; TV1 **không** tự trừ kho trong bước mock payment, để tránh xung đột giữa các nhánh sau này.

## API

`POST http://localhost:4000/payments/mock`

Headers:
```
Authorization: Bearer <JWT_LOGIN>
Content-Type: application/json
```

JSON:
```json
{
  "orderId": 1,
  "method": "MOCK_QR",
  "outcome": "SUCCESS",
  "idempotencyKey": "26c0d1fa-5f34-4e1c-9d76-ff2c8854ff01"
}
```

**Ví dụ kết quả** (dữ liệu tùy theo đơn của bạn):
```json
{
  "orderId": 1,
  "status": "PAID",
  "outcome": "SUCCESS",
  "amount": 65000,
  "method": "MOCK_QR",
  "idempotencyKey": "26c0d1fa-5f34-4e1c-9d76-ff2c8854ff01",
  "replayed": false,
  "message": "Thanh toán mô phỏng thành công (không thu tiền thật)."
}
```

**Quy tắc chính:**
- Cùng `idempotencyKey`, cùng đơn/method/outcome → trả cùng kết quả, `replayed: true`, không tạo thêm payment.
- Cùng key với payload khác → **409 Conflict**.
- Đơn đã `PAID`, gửi key mới → **409 Conflict**.
- Đơn thuộc người khác hoặc không tồn tại → **404 Not Found**.
- Chưa đăng nhập/JWT hết hạn → **401 Unauthorized**.
- `PENDING` hoặc `PAYMENT_FAILED` có thể bắt đầu lần thử mới bằng key mới.
- Mọi số tiền lấy từ `Order.total` trên PostgreSQL; **không tin giá client**.
- Thanh toán mock không tích hợp ngân hàng hoặc xử lý tiền thật.

### Idempotency khi tạo đơn

`POST /orders` vẫn nhận payload Sprint 2 cũ. Có thể thêm `idempotencyKey` là UUID v4:
```json
{
  "idempotencyKey": "42534e1e-4c59-4736-b9f1-23ca1bb39e03",
  "items": [
    { "productId": 3, "size": "L", "toppings": ["Kem"], "quantity": 1 }
  ]
}
```

Frontend `/cart` sinh UUID, lưu tạm ở sessionStorage theo tài khoản + nội dung giỏ để sử dụng lại nếu mạng mất kết nối. Khi tạo đơn thành công, xóa key tạm và xóa giỏ.

## Cài đặt từ ZIP mới trên Windows

1. Giải nén `BrewLite_Sprint3_TV1.zip`, mở **đúng thư mục** có `package.json` bằng VS Code.
2. Chạy `npm ci` ở thư mục gốc (Node.js 22.22.3+ hoặc 24.15+).
3. Sao chép `backend/.env.example` sang `backend/.env` **chỉ khi chưa có**, đặt `DATABASE_URL` và `JWT_SECRET` đúng cấu hình của máy bạn. Giữ `frontend/.env.local` có `NEXT_PUBLIC_API_URL=http://localhost:4000`.
4. Chạy `npm run prisma:generate -w @brewlite/backend` nếu cài đặt chưa tạo Prisma Client.
5. Chạy **`npm run prisma:deploy -w @brewlite/backend`** để thêm bảng `PaymentAttempt` vào **database hiện tại** (không xóa dữ liệu cũ).
6. **Không chạy `prisma:seed`, `prisma:reset` hay `prisma:push` trên database có dữ liệu cần giữ.** Seed của project này xóa toàn bộ sản phẩm/đơn/thanh toán trước khi nạp dữ liệu mẫu.
7. Chạy `npm run typecheck`, `npm run test`, `npm run build` để xác nhận compile.
8. Chạy `npm run dev`.
9. Đăng nhập → chọn món → giỏ hàng → **Đặt hàng** → **Thanh toán mô phỏng** → chọn thành công hoặc thất bại.
10. Thanh toán một đơn `PAID` lần thứ hai sẽ bị chặn. Với đơn `PAYMENT_FAILED`, có thể thử lại thành công.

## Danh sách test được viết thêm

- `backend/src/payments/payments.service.spec.ts`: 8 ca: thanh toán thành công, replay thành công, thất bại không charge, retry với key mới, chặn key dùng lại, chặn trả trùng, chặn sai chủ sở hữu, chặn đơn CANCELLED.
- `backend/src/orders/orders-idempotency.spec.ts`: 4 ca: replay cùng đơn, chặn đổi user, chặn đổi quantity, kiểm tra lưu key khi tạo đơn.

**Kiểm thử môi trường:** Trong phiên tạo ZIP này không cài được các packages từ npm registry nên chưa xác nhận `npm run typecheck`, `npm run test` và build. Đã kiểm tra cú pháp 52 file TypeScript/TSX bằng trình biên dịch TypeScript (0 lỗi) và chạy mô phỏng runtime PaymentsService trên dữ liệu fake với 5 tình huống (đều đạt). Đây **không** phải typecheck, Jest thật hoặc E2E PostgreSQL. Môi trường chạy tạm có Node.js 22.16.0 thấp hơn engine project và không hoàn thành được `npm ci`. Hãy chạy lệnh kiểm tra trên máy trước khi bàn giao TV2.

## Sprint 1–2: đánh giá phần đã bàn giao

- **Sprint 1**: có monorepo, Prisma, migration/seed sản phẩm, API sản phẩm, menu, chi tiết size/topping.
- **Sprint 2**: có Zustand cart + UI giỏ, auth register/login JWT, bảo vệ POST /orders, tạo đơn PENDING và backend tự kiểm tra giá, topping, tồn kho.
- Các bảng/trang/API này được kiểm tra **trên source**, không xác nhận 100% kiểm thử tích hợp DB thực tế. Lưu ý README gốc có vài câu trạng thái Sprint 1 đã cũ.
- **Sprint 3 còn lại cho các TV khác**: trang lịch sử/trạng thái đơn, luồng xử lý trạng thái, trừ tồn kho chống bán quá số lượng bằng transaction/optimistic locking, voucher/loyalty và đóng gói Docker theo phân công nhóm.

## File TV1 sửa/thêm

- `backend/prisma/schema.prisma` + migration `20261024115000_mock_payment_attempts`.
- `backend/src/payments/` (DTO, module, controller, service, unit test).
- `backend/src/orders/orders.controller.ts`, `orders.service.ts`, `orders/dto/create-order.dto.ts`, `orders-idempotency.spec.ts`.
- `backend/src/app.module.ts`.
- `frontend/app/cart/page.tsx`, `frontend/app/checkout/[id]/page.tsx`.
- `docs/SPRINT-03-TASK-08-TV1.md` (tài liệu này).
