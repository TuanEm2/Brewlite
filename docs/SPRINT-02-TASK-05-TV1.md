# Sprint 2 – Task 5: Bàn giao TV1 → TV2

## Phạm vi TV1

- Tích hợp Zustand 5.0.8 vào frontend, lưu giỏ hàng tại `frontend/store/cart-store.ts`.
- Logic tính tiền thuần tại `frontend/store/cart-utils.ts`.
- Nút **Thêm vào giỏ hàng** trong trang chi tiết `/products/[id]` với size/topping đã chọn.
- Số ly trong giỏ hiển thị trên menu và trang chi tiết.
- Tự gộp các ly có cùng sản phẩm/size/topping, giữ dữ liệu qua reload với localStorage.
- Nút **Xem Menu** trên trang chủ.
- Không sửa backend hoặc cơ sở dữ liệu của Sprint 1.

TV2 tiếp tục làm trang `/cart` và giao diện tăng/giảm số lượng, xóa món, tổng tiền, checkout.

## Cách dùng store cho TV2

```tsx
"use client";
import { useCartStore } from "../../store/cart-store";
import { cartCount, cartTotal } from "../../store/cart-utils";

const items = useCartStore((state) => state.items);
const setQuantity = useCartStore((state) => state.setQuantity);
const removeItem = useCartStore((state) => state.removeItem);
const clearCart = useCartStore((state) => state.clearCart);
const numberOfDrinks = cartCount(items);
const total = cartTotal(items);

setQuantity(item.key, 2);
removeItem(item.key);
// Sau khi thanh toán THÀNH CÔNG mới gọi clearCart().
```

Mỗi CartItem gồm: key, productId, name, imageUrl, basePrice, size {name, price}, toppings [{name, price}], unitPrice, quantity, maxQuantity.

### Quy tắc

- Cùng productId + size + tập topping → cùng dòng, cộng quantity.
- Size hoặc topping khác → dòng mới.
- Đơn giá = basePrice + phụ thu size + tổng phụ thu topping; tổng dòng = đơn giá × quantity.
- Frontend giới hạn số lượng dựa trên stock tại lúc chọn và tối đa 99 ly mỗi dòng.
- setQuantity(key, 0) xóa dòng. removeItem(key) xóa theo key. clearCart() xóa toàn bộ.
- Dữ liệu localStorage là **không đáng tin cậy**: backend Task 6 phải tự kiểm tra giá, lựa chọn hợp lệ và tồn kho trước khi tạo đơn; không nhận tổng tiền tự báo từ frontend.
- Thanh toán lỗi phải giữ giỏ hàng.

## Kiểm thử TV1 cần chạy

1. `npm ci` (đã cập nhật frontend/package.json và package-lock.json).
2. `npm run dev` (PostgreSQL dùng cấu hình đã có ở Sprint 1).
3. Trang chủ → Xem Menu → Cappuccino → size L và topping Kem: giá 65.000đ → Thêm vào giỏ.
4. Nhấn lần hai cùng lựa chọn: 2 ly. Đổi topping: thêm dòng mới.
5. Refresh: tổng số ly vẫn còn. Hết hàng: nút thêm bị vô hiệu.
6. `npm run typecheck`, `npm run test`, `npm run build`.

## Bàn giao GitHub

TV2 đồng bộ code mới nhất của `feature/tv01` vào `feature/tv02` trước khi phát triển. Không push trực tiếp main.