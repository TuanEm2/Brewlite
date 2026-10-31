# Sprint 3 — Task 9: Bàn giao sản phẩm, Lịch sử đơn & Docker Compose (TV6)

## 1. Thông tin chung
- **Thành viên thực hiện:** TV6
- **Nhánh làm việc:** `feature/tv06`
- **Nhiệm vụ:** Task 9 – Xác nhận, Lịch sử đơn (`GET /orders/me`), Docker Compose 3 dịch vụ, README, Smoke Test End-to-End và Kịch bản Demo nghiệm thu.
- **Kế thừa từ:** `feature/tv05` (commit `1003462`)
- **Bàn giao cho:** Nhóm trưởng TV1 & Toàn nhóm để kiểm thử, review PR và merge vào nhánh `main`.

---

## 2. Các công việc và file TV6 đã thực hiện trong Sprint 3

### 2.1. Giao diện Frontend (Next.js)
1. **Trang Lịch sử đơn hàng (`frontend/app/orders/page.tsx` - Mới):**
   - Gọi API `GET /orders/me` (hoặc `/api/orders/me`) đính kèm JWT token.
   - Hiển thị danh sách các đơn hàng đã đặt từ mới nhất đến cũ nhất.
   - Mỗi đơn hiển thị: Mã đơn `#id`, ngày giờ đặt, huy hiệu màu sắc tương ứng với trạng thái (`PAID`, `PENDING`, `PREPARING`, `READY`, `COMPLETED`, `PAYMENT_FAILED`, `CANCELLED`).
   - Hiển thị danh sách món (size, topping, số lượng, thành tiền), mã voucher và số tiền giảm giá nếu có.
   - Hỗ trợ nút **"Thanh toán ngay"** đối với đơn chưa thanh toán hoặc thanh toán lỗi (`PENDING`, `PAYMENT_FAILED`) dẫn thẳng tới trang thanh toán `/checkout/[id]`.
   - Nút **"Xem hóa đơn / chi tiết"** đối với đơn đã `PAID`.
   - Có trạng thái rỗng (Empty state), trạng thái đang tải (Loading spinner), và tự động redirect sang `/login` nếu chưa đăng nhập.
2. **Tích hợp Voucher tại Giỏ hàng (`frontend/app/cart/page.tsx` - Cập nhật):**
   - Bổ sung ô nhập mã giảm giá (Voucher) với gợi ý mã demo `BREW10` (giảm 10% tối đa 20.000đ cho đơn từ 50.000đ).
   - Tự động tính trước số tiền giảm ước tính ngay trên giỏ hàng.
   - Gửi trường `voucherCode` lên backend `POST /orders`.
   - Tự động thay đổi khóa Idempotency Key khi người dùng thay đổi voucher hoặc nội dung giỏ.
3. **Cập nhật Trang Thanh toán & Xác nhận (`frontend/app/checkout/[id]/page.tsx` - Cập nhật):**
   - Hiển thị dòng giảm giá Voucher trong phần tóm tắt thanh toán.
   - Tại màn hình xác nhận **"Đặt hàng thành công" (PAID)**, bổ sung nút liên kết trực tiếp **"Lịch sử đơn"** dẫn về `/orders`.
4. **Cập nhật Navbar toàn cục (`frontend/app/components/navbar.tsx` - Cập nhật):**
   - Bổ sung liên kết điều hướng nhanh **"Lịch sử đơn"** khi người dùng đã đăng nhập.

### 2.2. Đóng gói Docker & DevOps
1. **`backend/Dockerfile` (Mới):** Multi-stage build Node 22-alpine, tự động sinh Prisma Client, build NestJS và khởi động server production trên cổng 4000.
2. **`frontend/Dockerfile` (Mới):** Multi-stage build Node 22-alpine cho Next.js, nướng sẵn biến môi trường `NEXT_PUBLIC_API_URL` và khởi chạy production trên cổng 3000.
3. **`docker-compose.yml` (Mới):**
   - Khởi chạy đồng thời 3 dịch vụ liên thông:
     - `postgres`: PostgreSQL 16-alpine với healthcheck sẵn sàng.
     - `backend`: Phụ thuộc vào `postgres`, tự động đồng bộ CSDL và chạy API.
     - `frontend`: Phụ thuộc vào `backend`, chạy giao diện người dùng.
4. **`.dockerignore` (Mới):** Loại bỏ `node_modules`, `.next`, `dist`, logs giúp tối ưu kích thước image và tốc độ build.

### 2.3. Kiểm thử & Chất lượng mã nguồn (QA)
1. **`backend/test/smoke-mvp.e2e-spec.ts` (Mới):**
   - Bộ kiểm thử tự động End-to-End bao phủ toàn bộ 6 bước nghiệp vụ cốt lõi:
     1. Xem menu (`GET /products`).
     2. Xem chi tiết món (`GET /products/:id`).
     3. Đăng ký & Đăng nhập lấy JWT (`POST /auth/register`, `POST /auth/login`).
     4. Tạo đơn PENDING kèm voucher `BREW10` (`POST /orders`).
     5. Thanh toán thành công sang `PAID`, cộng điểm Loyalty Points và thử nghiệm chống trùng Idempotency (`POST /payments/mock`).
     6. Truy vấn lịch sử đơn hàng (`GET /orders/me`).
2. **`README.md` (Cập nhật):** Bổ sung hướng dẫn chạy bằng Docker Compose và kịch bản Demo 5 phút nghiệm thu cho Giảng viên.

---

## 3. Kết quả kiểm tra tính hợp lệ (Automated Verification)

| Hạng mục kiểm tra | Lệnh thực thi | Kết quả | Ghi chú |
|---|---|:---:|---|
| **Typecheck** | `npm run typecheck` | **PASS (0 lỗi)** | Đạt trên cả `@brewlite/frontend` và `@brewlite/backend`. |
| **Unit Tests** | `npm run test -w @brewlite/backend` | **148/148 PASS** | Toàn bộ các test của TV1, TV2, TV3, TV4, TV5, TV6 đều xanh. |
| **Prisma Generation** | `npm run prisma:generate -w @brewlite/backend` | **PASS** | Đồng bộ đầy đủ kiểu dữ liệu với schema mới nhất. |

---

## 4. Hướng dẫn chạy và nghiệm thu

### Cách 1: Chạy toàn bộ bằng Docker Compose (Khuyên dùng khi bàn giao)
Chỉ cần chạy duy nhất 1 câu lệnh tại thư mục gốc:
```bash
docker compose up --build
```
Sau đó truy cập:
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:4000/api/health`

### Cách 2: Chạy trực tiếp trên máy phát triển
```bash
# Terminal 1: Chạy backend
npm run dev:api

# Terminal 2: Chạy frontend
npm run dev:web
```

---

## 5. Kịch bản Demo 5 phút cho buổi nghiệm thu với Giảng viên

1. **Bước 1: Xem Menu & Chi tiết sản phẩm**
   - Vào `http://localhost:3000/menu` $\rightarrow$ Thấy danh sách 4 đồ uống kèm hình ảnh, giá gốc.
   - Nhấn "Chọn món" tại món Cappuccino $\rightarrow$ Chọn Size L (+10.000đ), chọn Topping Kem (+10.000đ) $\rightarrow$ Thấy giá tự động cộng dồn thành 65.000đ.
   - Nhấn **"Thêm vào giỏ hàng"**.

2. **Bước 2: Giỏ hàng, Voucher & Xác thực**
   - Vào `http://localhost:3000/cart` $\rightarrow$ Thấy món vừa chọn.
   - Nhập mã voucher **`BREW10`** $\rightarrow$ Hệ thống tự động tính giảm 10% (giảm 6.500đ).
   - Nhấn "Thanh toán" $\rightarrow$ Hệ thống kích hoạt Route Guard yêu cầu Đăng nhập/Đăng ký.
   - Đăng nhập (hoặc đăng ký mới) $\rightarrow$ Tự động quay lại giỏ hàng và chuyển tiếp sang trang Thanh toán `/checkout/[id]`.

3. **Bước 3: Thanh toán không tiền mặt & Idempotency**
   - Tại trang `/checkout/[id]`, đơn hàng ở trạng thái `PENDING`.
   - Chọn phương thức: **Ví điện tử** hoặc **Thẻ ngân hàng**.
   - Bấm **"Xác nhận trả"** $\rightarrow$ Đơn hàng chuyển sang trạng thái **`PAID`**.
   - Màn hình chuyển sang giao diện xác nhận: Biểu tượng tick xanh, "Đặt hàng thành công", "Mời bạn tới quầy lấy nước ☕".
   - Giỏ hàng tự động được xóa sạch.

4. **Bước 4: Xem Lịch sử đơn hàng**
   - Bấm nút **"Lịch sử đơn"** trên màn hình xác nhận (hoặc trên Navbar).
   - Trang `/orders` hiển thị đơn hàng vừa thanh toán với trạng thái `PAID`, chi tiết các món, tổng tiền và voucher đã dùng.

---

## 6. Sẵn sàng bàn giao cho Nhóm trưởng (TV1)
Nhánh `feature/tv06` hiện đã bao phủ trọn vẹn **Task 9** và đóng gói hoàn chỉnh sản phẩm. Sẵn sàng để TV1 mở Pull Request và merge vào `main` trong buổi họp tối 26/10/2026.
