# Sprint 2 – Task 5 (UI): Trang giỏ hàng — bàn giao TV2 → TV3

## Phạm vi TV2

Theo phân công, 23/10, Task 5 (UI): trang Cart, thay số lượng, xóa, badge, empty cart, tổng tiền.

- [x] Trang `/cart` (`frontend/app/cart/page.tsx`): mỗi dòng hiện tên, size, topping, đơn giá, số lượng, thành tiền.
- [x] Nút `−` / `+` đổi số lượng. `−` dừng ở 1 ly; `+` dừng ở tồn kho lúc chọn hoặc tối đa 99 ly.
- [x] Nút **Xóa** từng dòng và **Xóa toàn bộ giỏ hàng** (có bước xác nhận).
- [x] Trạng thái giỏ trống, có nút quay lại menu.
- [x] Tổng số ly và tổng tiền.
- [x] Badge giỏ hàng nổi ở góc dưới phải mọi trang trừ `/cart` (`frontend/app/components/cart-badge.tsx`, gắn trong `layout.tsx`); số ly hiện tối đa `99+`.
- [x] Dòng "Giỏ hàng: N ly" ở trang menu và trang chi tiết thành liên kết tới `/cart`.
- [x] Hàm hiển thị thuần trong `frontend/store/cart-view.ts` và 5 test trong `backend/src/cart/cart-view.spec.ts`.
- Không sửa store/logic của TV1, backend API hay cơ sở dữ liệu.

## Cách dùng / mở rộng

- Dữ liệu lấy từ `useCartStore` của TV1 (`items`, `setQuantity`, `removeItem`, `clearCart`); tổng dùng `cartCount`, `cartTotal`.
- Giỏ hàng nằm trong localStorage nên trang chỉ hiển thị sau khi tải xong ở trình duyệt (tránh lỗi hydration).
- Nút **Thanh toán** đang tắt có chủ đích. Task 6–7 (TV3–TV6) nối nút này với đăng nhập và `POST /orders`; Task 8 (Sprint 3, TV2) làm màn hình thanh toán.
- Khi gửi đơn chỉ nên gửi `productId`, `size.name`, tên topping và `quantity`; server tự tính giá. Chỉ gọi `clearCart()` sau khi thanh toán thành công.

## Kiểm thử đã chạy

1. `npm ci`, `npm run typecheck`, `npm run test` (27 test), `npm run build` (có route `/cart`).
2. Thử trên trình duyệt: giỏ Cappuccino M ×1 + Trà đào L (Kem, Trân châu) ×2 → tổng 178.000 ₫; `+` tới 3 thì bị khóa (tồn 3); `−`; xóa một dòng; tải lại trang vẫn còn; xóa hết → hiện giỏ trống; badge trang chủ hiện số ly và dẫn tới `/cart`.

## Bàn giao

- Thành viên: TV2 • Task: 5 (UI) • Nhánh: `feature/tv02` (đã merge `feature/tv01` commit `a5cda54`)
- Người nhận tiếp: TV3 (Task 6 – model Order/OrderItem, DTO, service đơn PENDING)
- Vấn đề còn tồn tại: nút Thanh toán chưa hoạt động (thuộc Task 6–8); giá trong giỏ là ảnh chụp lúc thêm, chưa tự cập nhật nếu giá sản phẩm đổi.
