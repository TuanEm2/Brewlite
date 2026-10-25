# Sprint 2 — Task 7: Tích hợp Giao diện Auth, JWT Guard & Luồng Giỏ hàng → Tạo đơn (TV6)

## 1. Thông tin chung
- **Thành viên thực hiện:** TV6
- **Nhánh làm việc:** `feature/tv06`
- **Nhiệm vụ:** Tích hợp UI Đăng ký / Đăng nhập, quản lý phiên JWT phía Client, thiết lập Guard bảo vệ endpoint `POST /orders`, và kiểm thử liên thông toàn bộ luồng Giỏ hàng → Auth → Tạo đơn PENDING.
- **Kế thừa từ:** `feature/tv05` (commit `4998db4`)
- **Bàn giao cho:** TV1 (làm nền tảng cho Sprint 3: Thanh toán Mock Payment, Idempotency & Quản lý trạng thái đơn).

---

## 2. Các file TV6 đã tạo mới và chỉnh sửa

### Backend (NestJS):
1. **`backend/src/auth/jwt-auth.guard.ts` (Mới):**
   - Triển khai `CanActivate`.
   - Bắt buộc header `Authorization: Bearer <token>`.
   - Sử dụng `jwtService.verifyAsync()` để xác thực chữ ký HS256 với `JWT_SECRET` và kiểm tra thời hạn token (`exp`).
   - Kiểm tra mã người dùng `sub` hợp lệ và gán `{ id, email }` vào `request.user`.
   - Chặn đứng mọi request thiếu token, token sai cú pháp, token giả mạo hoặc hết hạn với mã lỗi **401 Unauthorized**.
2. **`backend/src/auth/current-user.decorator.ts` (Mới):**
   - Custom param decorator `@CurrentUser()` trích xuất thông tin người dùng từ request đã xác thực.
3. **`backend/src/auth/jwt-auth.guard.spec.ts` (Mới):**
   - Bộ 6 unit test bao phủ toàn bộ các ca kiểm thử của Guard (thiếu header, sai Bearer, token hết hạn, sub không hợp lệ, token hợp lệ).
4. **`backend/src/auth/auth.module.ts` (Sửa):**
   - Cung cấp và export `JwtAuthGuard` để các module khác sử dụng.
5. **`backend/src/orders/orders.controller.ts` (Sửa):**
   - Gắn `@UseGuards(JwtAuthGuard)` bảo vệ endpoint `@Post()` cho cả `/orders` và `/api/orders`.
   - Lấy `user.id` từ `@CurrentUser()` truyền vào `ordersService.createPending(user.id, dto)`.
   - Triệt tiêu hoàn toàn rủi ro client tự giả mạo `userId`.
6. **`backend/src/orders/orders.module.ts` (Sửa):**
   - Import `AuthModule`.
7. **`backend/test/orders-auth.e2e-spec.ts` (Mới):**
   - 8 test case kiểm thử tích hợp E2E bảo vệ route đặt đơn trên cả `/orders` và `/api/orders`.

### Frontend (Next.js):
1. **`frontend/store/auth-store.ts` (Mới):**
   - Store Zustand quản lý trạng thái đăng nhập (`token`, `user`) kèm middleware `persist` lưu vào `localStorage`.
   - Hàm `setAuth(token, user)` và `logout()`.
2. **`frontend/app/components/navbar.tsx` (Mới):**
   - Header cố định trên mọi trang: Hiển thị logo BrewLite, liên kết Menu, Giỏ hàng.
   - Hiển thị email người dùng và nút **Đăng xuất** khi đã đăng nhập; nút **Đăng nhập** / **Đăng ký** khi chưa đăng nhập.
3. **`frontend/app/layout.tsx` (Sửa):**
   - Tích hợp `<Navbar />` toàn cục.
4. **`frontend/app/login/page.tsx` (Mới):**
   - Form đăng nhập với validation, xử lý hiển thị lỗi 401/400.
   - Hỗ trợ tham số query `?redirect=...` để quay lại đúng trang người dùng đang thao tác dở dang (ví dụ: quay lại `/cart`).
5. **`frontend/app/register/page.tsx` (Mới):**
   - Form đăng ký với validation: kiểm tra email, mật khẩu tối thiểu 8 ký tự, xác nhận mật khẩu khớp.
   - Tự động đăng nhập và lưu JWT token ngay sau khi đăng ký thành công.
6. **`frontend/app/cart/page.tsx` (Sửa):**
   - **Route Guard:** Nếu người dùng chưa đăng nhập, nút hành động hướng dẫn chuyển hướng sang `/login?redirect=/cart`.
   - Khi đã đăng nhập, cho phép gọi `POST /orders` kèm header `Authorization: Bearer <token>`.
   - Xóa giỏ hàng khi tạo đơn thành công và hiển thị thẻ thông báo đơn hàng **PENDING** với mã đơn, tổng tiền, danh sách món và nút tiếp tục mua hàng.

---

## 3. Biên bản kiểm thử tích hợp luồng Sprint 2 (End-to-End Test Matrix)

| STT | Luồng kiểm thử (Test Scenario) | Thao tác thực hiện | Kết quả mong đợi | Đánh giá |
|:---:|---|---|---|:---:|
| 1 | **Tạo tài khoản mới** | Vào `/register`, nhập email mới, mật khẩu $\ge$ 8 ký tự | Đăng ký 201 thành công, tự động cấp JWT và hiển thị email trên Navbar. | **ĐẠT** |
| 2 | **Kiểm tra mật khẩu yếu** | Vào `/register`, nhập mật khẩu < 8 ký tự | Chặn phía client và báo "Mật khẩu phải có ít nhất 8 ký tự". | **ĐẠT** |
| 3 | **Đăng nhập** | Vào `/login`, nhập tài khoản vừa tạo | Đăng nhập 200, lưu JWT vào `localStorage`, chuyển về trang redirect. | **ĐẠT** |
| 4 | **Sai mật khẩu (401)** | Vào `/login`, nhập sai mật khẩu | Báo lỗi rõ ràng: "Email không tồn tại hoặc mật khẩu chưa chính xác." | **ĐẠT** |
| 5 | **Thêm vào giỏ từ chi tiết** | Vào `/products/3`, chọn Size M + Trân châu $\rightarrow$ Bấm "Thêm vào giỏ" | Badge giỏ hàng cập nhật số lượng, dữ liệu lưu trong giỏ hàng. | **ĐẠT** |
| 6 | **Chặn tạo đơn khi chưa login** | Đăng xuất, vào `/cart` xem giỏ hàng | Nút đặt hàng chuyển thành "Đăng nhập để đặt hàng", bấm vào chuyển sang `/login?redirect=/cart`. | **ĐẠT** |
| 7 | **Tạo đơn hàng PENDING** | Đăng nhập xong quay lại `/cart`, bấm "Đặt hàng" | Gửi `POST /orders` kèm Bearer token, nhận mã đơn, trạng thái PENDING, xóa sạch giỏ hàng. | **ĐẠT** |
| 8 | **Chặn API không có token (401)** | Gửi HTTP `POST /orders` không kèm header Authorization | Trả về 401 Unauthorized: "Vui lòng đăng nhập để tiếp tục." | **ĐẠT** |
| 9 | **Chặn token giả mạo (401)** | Gửi `POST /orders` kèm Bearer token có chữ ký sai | Trả về 401 Unauthorized: "Phiên đăng nhập đã hết hạn hoặc token không hợp lệ." | **ĐẠT** |
| 10 | **Đăng xuất** | Bấm nút "Đăng xuất" trên Navbar | Xóa sạch token và user trong `localStorage`, giao diện trở về trạng thái khách vãng lai. | **ĐẠT** |

---

## 4. Kết quả kiểm tra tự động (Automated Verification)
- **Monorepo Typecheck:** `npm run typecheck` $\rightarrow$ **0 lỗi** trên cả frontend và backend.
- **Backend Unit Tests:** `npm run test -w @brewlite/backend` $\rightarrow$ **56/56 tests ĐẠT** (gồm Auth, Orders, Cart, Guard, Pipes).
- **Frontend Production Build:** `npm run build -w @brewlite/frontend` $\rightarrow$ **ĐẠT**, tối ưu hóa và sinh các trang tĩnh/động không lỗi.

---

## 5. Kết luận & Sẵn sàng bàn giao cho Sprint 3
- Đã hoàn thành 100% các tiêu chí nghiệm thu của **Sprint 2 (Task 5, 6, 7)** theo đúng Definition of Done.
- Luồng liên thông hoàn chỉnh: **Menu $\rightarrow$ Chi tiết món $\rightarrow$ Thêm giỏ hàng $\rightarrow$ Đăng nhập/Đăng ký $\rightarrow$ Tạo đơn PENDING**.
- Sẵn sàng bàn giao nhánh `feature/tv06` cho **Nhóm trưởng TV1** để bắt đầu **Sprint 3 (Task 8: Mock Payment & Idempotency, Task 9 & 10)**.
