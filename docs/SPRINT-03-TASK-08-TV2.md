# Sprint 3 – Task 8 (UI): Checkout Ví/Thẻ — bàn giao TV2 → TV3

## Phạm vi TV2

Theo phân công, 25/10, Task 8 (UI): checkout Ví/Thẻ, gọi API, giữ giỏ khi thất bại, dùng đúng khóa thanh toán khi thử lại.
Kế thừa `feature/tv01-sprint3` (commit `43db8b8`, API `POST /payments/mock` của TV1).

- [x] **Checkout Ví/Thẻ** (`frontend/app/checkout/[id]/page.tsx`): bố cục theo wireframe 4 của đề — danh sách món, tổng tiền, chọn **Ví điện tử** hoặc **Thẻ ngân hàng**, nút **Xác nhận trả**. Ví ↔ `MOCK_QR`, Thẻ ↔ `MOCK_CARD` của API.
- [x] **Gọi API**: `GET /orders/:id` để lấy đơn, `POST /payments/mock` kèm JWT. Ô "Kết quả mô phỏng" (Thành công/Thất bại) chỉ để demo luồng lỗi, vì API mock của TV1 yêu cầu trường `outcome`.
- [x] **Màn hình xác nhận** theo wireframe 5: "Đặt hàng thành công", mã đơn, trạng thái `PAID`, phương thức, "Mời bạn tới quầy lấy nước", nút Về trang chủ / Đặt thêm. Mở lại `/checkout/<id>` của đơn đã PAID cũng hiện màn này.
- [x] **Giữ giỏ khi thất bại** (US-05): `/cart` không còn xóa giỏ khi tạo đơn PENDING. Giỏ chỉ bị xóa khi đơn chuyển `PAID`. Thanh toán lỗi → đơn `PAYMENT_FAILED`, giỏ còn nguyên, có nút Thử lại và link Xem lại giỏ hàng.
- [x] **Không tạo đơn trùng**: nút "Thanh toán" ở `/cart` nhớ đơn đang chờ (theo tài khoản + nội dung giỏ, trong sessionStorage). Quay lại giỏ rồi bấm Thanh toán sẽ về đúng đơn cũ; đổi món/số lượng/tài khoản thì tạo đơn mới.
- [x] **Đúng khóa thanh toán khi thử lại**: khóa (`idempotencyKey`, UUID v4) lưu theo đơn trong sessionStorage.
  - Mất kết nối/không rõ kết quả → **giữ** khóa; bấm Thử lại với cùng phương thức + kết quả sẽ gửi **lại đúng khóa đó**, server trả kết quả cũ (`replayed`) chứ không ghi nhận lần hai.
  - Server đã trả lời rõ ràng (thành công/thất bại/lỗi) → xóa khóa; lần thử sau dùng khóa mới (đúng quy tắc API của TV1).
  - Nếu server báo 409 (vd. đơn đã trả ở lần trước), trang tự tải lại đơn và hiện màn xác nhận nếu đã `PAID`.
- [x] Sửa lỗi TypeScript ở trang checkout của TV1 (`let attempt … = null` bị suy ra kiểu `never`), làm `typecheck`/`build` thất bại.
- [x] Hàm thuần `frontend/store/checkout-utils.ts` + 9 test `backend/src/cart/checkout-utils.spec.ts`.
- Không sửa backend, schema hay migration.

## Kiểm thử đã chạy

1. `npm ci`, `npm run typecheck` (0 lỗi), `npm run test` (76/76), `npm run build` (có `/checkout/[id]`).
2. Luồng trên trình duyệt với API giả lập đúng hợp đồng `POST /orders`, `GET /orders/:id`, `POST /payments/mock`:
   - Giỏ 2 dòng → Thanh toán → `/checkout/1`, giỏ còn nguyên, đơn `PENDING`.
   - Chọn Thẻ + Thất bại → đơn `PAYMENT_FAILED`, giỏ còn 2 dòng, hiện thông báo + Thử lại.
   - Quay lại giỏ, bấm Thanh toán → về lại `/checkout/1`, **không** gọi `POST /orders` lần hai.
   - Chọn Ví + Thành công, giả lập mất phản hồi → hiện thông báo mất kết nối; bấm Thử lại → gửi **cùng** `idempotencyKey`, nhận kết quả cũ → màn xác nhận `PAID`, giỏ được xóa.
3. **Chưa chạy với PostgreSQL thật** trong môi trường của TV2 khi viết tài liệu này — cần chạy lại trên máy có DB trước khi push (mục dưới).

## Chạy thử trên máy có PostgreSQL

```powershell
npm.cmd ci
npm.cmd run prisma:deploy -w @brewlite/backend   # thêm bảng PaymentAttempt, không xóa dữ liệu
npm.cmd run typecheck; npm.cmd run test; npm.cmd run build
npm.cmd run dev
```
Đăng nhập → Menu → thêm món → Giỏ → **Thanh toán** → chọn Ví/Thẻ → thử Thất bại rồi Thành công.

## Bàn giao

- Thành viên: TV2 • Task: 8 (UI) • Nhánh: `feature/tv02` (đã merge `feature/tv01-sprint3`)
- Người nhận tiếp: TV3 (Task 10 – Order State Machine)
- Lưu ý cho TV3/TV5/TV6: trang xác nhận đọc `status` từ `GET /orders/:id`; khi thêm `PREPARING/READY/COMPLETED`, nhãn tiếng Việt đã có sẵn trong `statusLabel()`. Lịch sử đơn (`GET /orders/me`, Task 9) có thể link tới `/checkout/<id>` để xem lại đơn.
- Vấn đề còn tồn tại: tên đồ uống trên trang checkout lấy từ giỏ hiện tại; nếu giỏ đã đổi thì hiện "Đồ uống #id" (API đơn chưa trả tên sản phẩm).
