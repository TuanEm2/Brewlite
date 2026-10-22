# Sprint 1 — Task 3: Trang Menu Đồ Uống và Tích hợp API (TV4)

## User Story / Goal

Là người dùng ứng dụng BrewLite, tôi muốn xem danh sách các món đồ uống trên trang Menu với thông tin tên món, hình ảnh, đơn giá chính xác từ hệ thống để có thể chọn món đặt hàng.

Là TV4, tôi cần xây dựng giao diện trang Menu (`frontend/app/page.tsx`), gọi API `GET /products` từ backend NestJS/PostgreSQL, xử lý các trạng thái giao diện (loading, error, empty state) và chuẩn bị sẵn giao diện kết nối cho trang chi tiết sản phẩm.

## Acceptance Criteria (theo tài liệu BrewLite, phần Task 3)

- [x] Giao diện trang Menu hiển thị danh sách sản phẩm lấy động từ API `GET /products`.
- [x] Hiển thị đầy đủ các thông tin: hình ảnh, tên sản phẩm, đơn giá (định dạng VND) và badge mã ID sản phẩm (`#1`, `#2`,...).
- [x] Xử lý trạng thái đang tải (Loading state) mượt mà khi chờ dữ liệu phản hồi từ backend.
- [x] Xử lý trạng thái trống (Empty state) khi danh sách trả về từ API không có sản phẩm.
- [x] Xử lý lỗi (Error state) và hiển thị thông báo thân thiện khi không kết nối được tới API backend.
- [x] Định dạng giá tiền chuẩn Việt Nam (VD: `35.000 đ`).
- [x] Đã kiểm tra tương thích giao diện trên các thiết bị (Responsive cho Desktop, Tablet và Mobile).
- [x] Đã chạy `npm run typecheck`, `npm run test`, `npm run build` không lỗi (22/10/2026).
- [x] Đã push nhánh `feature/tv04` (hoặc `Brewlite-feature-tv03`) lên GitHub.
- [ ] TV5 xác nhận pull/kế thừa được để làm tiếp trang chi tiết món (`GET /products/:id`).

## Structure & Giao diện trang Menu (`frontend/app/page.tsx`)

| Thành phần UI | Cấu trúc / Thẻ | Chức năng & Ghi chú |
|---|---|---|
| Header | `header`, `h1`, `p` | Tiêu đề "Menu Đồ Uống BrewLite", icon `☕` và khẩu hiệu ứng dụng |
| Product Grid | `div.grid` | Lưới 2 cột (Desktop) / 1 cột (Mobile) hiển thị danh sách card món ăn |
| Product Card | `div.card` | Thẻ sản phẩm gồm hình ảnh, Badge ID, tên món, mô tả và giá tiền |
| Price Tag | `span` | Định dạng tiền tệ VND (`Intl.NumberFormat('vi-VN')`) |
| Action Button | `button` / `Link` | Nút "Chọn món" điều hướng sang trang chi tiết (`/products/[id]`) |
| State Feedback | `div` | Khung hiển thị icon/thông báo khi đang Loading, lỗi API hoặc danh sách trống |

## Xử lý Trạng thái & Luồng dữ liệu (State Management)

Dữ liệu được gọi từ API bằng `useEffect` trong React Client Component:

```tsx
// Frontend: fetch dữ liệu từ Backend NestJS
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

useEffect(() => {
  async function fetchProducts() {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/products`);
      if (!res.ok) throw new Error('Không thể tải danh sách sản phẩm');
      const data = await res.json();
      setProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  }
  fetchProducts();
}, []);
```

Kiểu dữ liệu nhận về từ API `GET /products`:

```json
[
  {
    "id": 1,
    "name": "Cà phê sữa",
    "price": 35000,
    "imageUrl": "https://placehold.co/300x200"
  },
  {
    "id": 2,
    "name": "Americano",
    "price": 40000,
    "imageUrl": "https://placehold.co/300x200"
  }
]
```

## Dữ liệu hiển thị thực tế trên Menu

Sau khi gọi API thành công, menu hiển thị các món đã được seed từ Task 2:

| id | Mã hiển thị | Tên sản phẩm | Đơn giá hiển thị | Trạng thái hiển thị |
|---|---|---|---|---|
| 1 | `#1` | Cà phê sữa | 35.000 đ | Hiển thị nút "Chọn món" |
| 2 | `#2` | Americano | 40.000 đ | Hiển thị nút "Chọn món" |
| 3 | `#3` | Cappuccino | 45.000 đ | Hiển thị nút "Chọn món" |
| 4 | `#4` | Trà đào | 39.000 đ | Hiển thị nút "Chọn món" |

## Chạy và kiểm tra

Xem mục 3 trong `README.md` để biết hướng dẫn chạy đầy đủ. Tóm tắt các bước kiểm tra cho TV4:

```powershell
# Terminal 1: Chạy Backend NestJS (Cần PostgreSQL đã migrate & seed)
npm run dev:api

# Terminal 2: Chạy Frontend Next.js
npm run dev:web

# Kiểm tra Build & Typecheck trước khi bàn giao
npm run typecheck
npm run build
```

Mở trình duyệt truy cập `http://localhost:3000` để kiểm tra giao diện Menu.

## Gợi ý cho thành viên tiếp theo

- **TV5 (Task 5 - Chi tiết món & Options):** 
  - Kế thừa giao diện từ TV4. Khi người dùng bấm "Chọn món" ở bất kỳ sản phẩm nào trên Menu, chuyển hướng qua tuyến đường `/products/[id]` (hoặc hiển thị Modal chi tiết).
  - Sử dụng endpoint `GET /products/:id` (TV3 đã viết) để lấy thêm thông tin `stock`, `sizes` (S, M, L) và `toppings`.
  - Thực hiện logic chọn Size/Topping và tự động tính tổng tiền động theo công thức:
    $$\text{Đơn giá} = \text{price} + \text{size.price} + \sum \text{topping.price}$$

## Bàn giao

- Thành viên: TV4 • Task: 3 (Trang Menu & Tích hợp API) • Nhánh: `feature/tv04` (kế thừa `feature/tv03` / `feature/tv02`)
- Mã commit bàn giao: *(Commit mới nhất trên nhánh `feature/tv04`)*
- URL/trang liên quan: `http://localhost:3000` (Trang Menu chính)
- Người nhận tiếp: TV5
- Vấn đề còn tồn tại: Chưa tích hợp bộ lọc theo danh mục sản phẩm (Category); hình ảnh hiện đang dùng placeholder, sẽ thay thế bằng ảnh CDN thực tế ở các Sprint sau.