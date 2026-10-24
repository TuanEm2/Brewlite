# Sprint 1 — Task 4: Báo cáo Tích hợp & Kiểm thử Menu → Chi tiết (TV6)

## 1. Thông tin chung
- **Thành viên thực hiện:** TV6
- **Nhánh làm việc:** `feature/tv06`
- **Nhiệm vụ:** Tích hợp tùy chọn Size/Topping, thống nhất công thức tính giá với backend, kiểm thử liên thông giao diện Menu (`/menu`) → Chi tiết đồ uống (`/products/:id`).
- **Kế thừa từ:** `feature/tv05` (commit `7cf27dc`)
- **Bàn giao cho:** TV1 (chuẩn bị base cho Sprint 2)

---

## 2. Danh mục các file đối chiếu & kiểm tra

| Thành phần | Đường dẫn file | Mục đích đối chiếu |
|---|---|---|
| **CSDL (Prisma)** | `backend/prisma/schema.prisma` | Kiểm tra cấu trúc bảng `Product` (`sizes`, `toppings` dạng JSON, `stock`, `price`). |
| **Dữ liệu mẫu (Seed)** | `backend/prisma/seed.ts` | Đối chiếu 4 sản phẩm mẫu, danh sách phụ thu size (S: +0đ, M: +5.000đ, L: +10.000đ) và topping (Trân châu: +5.000đ, Kem: +10.000đ). |
| **Backend DTO** | `backend/src/products/dto/product-response.dto.ts` | Khớp kiểu `PricedOption` (`name`, `price`) và `ProductDetailDto`. |
| **Backend API** | `backend/src/products/products.controller.ts` | Kiểm tra định tuyến `@Controller(['products', 'api/products'])` chấp nhận cả hai prefix. |
| **Frontend Menu** | `frontend/app/menu/page.tsx` | Kiểm tra hiển thị danh sách, đơn giá, nút "Chọn món" chuyển hướng đến `/products/[id]`. |
| **Frontend Chi tiết** | `frontend/app/products/[id]/page.tsx` | Kiểm tra gọi `GET /products/:id`, logic chọn radio size, checkbox topping, cộng dồn giá tức thời. |

---

## 3. Thống nhất quy ước tính giá

Toàn bộ hệ thống thống nhất công thức tính giá một ly đồ uống như sau:

$$\text{Tổng tiền 1 ly} = \text{Giá gốc (Base Price)} + \text{Phụ thu Size} + \sum \text{Phụ thu Topping đã chọn}$$

*Quy ước chi tiết:*
- **Base Price:** Ứng với Size S và không có topping.`
- **Size mặc định:** Luôn chọn sẵn **Size S** (+0đ) khi người dùng vừa vào trang chi tiết.
- **Topping:** Cho phép chọn không giới hạn số lượng loại topping (0, 1 hoặc nhiều loại).

---

## 4. Biên bản kiểm thử tích hợp (Integration Test Matrix)

| STT | Tình huống kiểm thử (Test Scenario) | Thao tác thực hiện | Kết quả mong đợi | Đánh giá |
|:---:|---|---|---|:---:|
| 1 | **Hiển thị Menu** | Truy cập `http://localhost:3000/menu` | Hiển thị 4 sản phẩm (Cà phê sữa 35k, Americano 40k, Cappuccino 45k, Trà đào 39k) kèm nút "Chọn món". | **ĐẠT** |
| 2 | **Chuyển hướng Chi tiết** | Click "Chọn món" tại thẻ Cappuccino | URL chuyển sang `/products/3`, tải thông tin Cappuccino giá gốc 45.000đ, mặc định chọn Size S. | **ĐẠT** |
| 3 | **Đổi Size** | Chọn Size M (+5.000đ) rồi Size L (+10.000đ) | Tổng giá cập nhật tức thời: Size M = 50.000đ, Size L = 55.000đ. | **ĐẠT** |
| 4 | **Chọn Topping** | Tại Size L (55.000đ), tích chọn "Trân châu" (+5.000đ) và "Kem" (+10.000đ) | Giá hiển thị chính xác 70.000đ. Bỏ chọn "Kem" thì giá giảm về 60.000đ. | **ĐẠT** |
| 5 | **Quay lại Menu** | Nhấn link "← Quay lại menu" | Trình duyệt điều hướng mượt mà về lại trang `/menu`. | **ĐẠT** |
| 6 | **Sản phẩm không tồn tại (404)** | Truy cập trực tiếp `/products/999999` | Hiển thị banner cảnh báo: "Sản phẩm không tồn tại." kèm nút "Thử lại". | **ĐẠT** |
| 7 | **ID sai định dạng (400)** | Truy cập trực tiếp `/products/abc` | Hiển thị thông báo: "Mã sản phẩm không hợp lệ." | **ĐẠT** |
| 8 | **Lỗi kết nối Backend (Network Error)** | Dừng backend NestJS và bấm "Thử lại" | Hiển thị thông báo: "Không kết nối được API. Kiểm tra backend và thử lại." | **ĐẠT** |

---

## 5. Kết quả tự động hóa (Automated Checks)
- **Typecheck (TypeScript):** Passed trên cả frontend và backend (`npm run typecheck`).
- **Backend Unit Tests:** 14/14 test cases đạt (`npm run test -w @brewlite/backend`).
- **E2E API Tests:** 18/18 assertions đạt (`products.e2e-spec.ts`).
- **Build Production:** Backend và Frontend build không phát sinh cảnh báo lỗi cú pháp.

---

## 6. Kết luận & Bàn giao cho Sprint 2
- Đã nghiệm thu trọn vẹn luồng **Menu → Chi tiết sản phẩm** theo đúng tiêu chí DoD (Definition of Done) của Sprint 1.
- Sẵn sàng bàn giao nhánh `feature/tv06` cho TV1 nhận làm base bắt đầu **Sprint 2 (Task 5: Quản lý giỏ hàng với Zustand)**.
