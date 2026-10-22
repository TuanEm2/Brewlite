# Sprint 1 — Task 2: API danh sách sản phẩm (TV3)

## User Story / Goal

Là khách hàng, tôi muốn xem menu đồ uống (hình, tên, giá) và chi tiết từng món (size, topping), để chọn đồ uống trước khi đặt. TV3 cung cấp API cho TV4 (Task 3 – Menu) và TV5/TV6 (Task 4 – Chi tiết).

## Acceptance Criteria (theo tài liệu BrewLite, Task 2 và mục 12.1)

- [x] `GET /products` trả JSON menu gồm `id`, `name`, `price`, `imageUrl` từ CSDL.
- [x] `GET /products/:id` trả chi tiết một sản phẩm, thêm `stock`, `sizes`, `toppings`.
- [x] Trả `404` khi sản phẩm không tồn tại, `400` khi `id` không hợp lệ.
- [x] Có test e2e (Jest + supertest) cho cả hai endpoint.
- [x] Đã chạy `npm run typecheck`, `npm run test`, `npm run test:e2e`, `npm run build` không lỗi (22/10/2026).

## Endpoint

Mỗi endpoint phục vụ ở hai đường dẫn: `/products` (đúng như đề) và `/api/products` (khớp prefix `api` của `AppController`). Hai đường dẫn trả kết quả giống nhau.

| Method | Địa chỉ | Kết quả |
|---|---|---|
| `GET` | `/products` | `200`, mảng sản phẩm, sắp theo `id` tăng dần |
| `GET` | `/products/:id` | `200` chi tiết · `400` id sai · `404` không có |

`GET /products`:

```json
[
  { "id": 1, "name": "Cà phê sữa", "price": 35000, "imageUrl": "https://placehold.co/400x400?text=Ca+Phe+Sua" }
]
```

`GET /products/3`:

```json
{
  "id": 3,
  "name": "Cappuccino",
  "price": 45000,
  "imageUrl": "https://placehold.co/400x400?text=Cappuccino",
  "stock": 100,
  "sizes": [
    { "name": "S", "price": 0 },
    { "name": "M", "price": 5000 },
    { "name": "L", "price": 10000 }
  ],
  "toppings": [
    { "name": "Trân châu", "price": 5000 },
    { "name": "Kem", "price": 10000 }
  ]
}
```

Lỗi theo định dạng mặc định của NestJS:

```json
{ "message": "Không tìm thấy sản phẩm có id 999", "error": "Not Found", "statusCode": 404 }
```

`id` hợp lệ là số nguyên dương từ `1` đến `2147483647` (giới hạn kiểu `Int` của PostgreSQL). `abc`, `1.5`, `0`, `-1`, `1abc` hay số lớn hơn đều trả `400`. Không trả cột `version` vì đó là cột nội bộ cho optimistic locking (Task 10).

## Cấu trúc code

```text
backend/
├── src/
│   ├── common/pipes/
│   │   ├── positive-int-id.pipe.ts       # kiểm tra :id, dùng lại được cho đơn hàng
│   │   └── positive-int-id.pipe.spec.ts  # unit test, không cần CSDL
│   └── products/
│       ├── dto/product-response.dto.ts   # kiểu dữ liệu trả về
│       ├── products.controller.ts
│       ├── products.module.ts            # export ProductsService cho Task 6
│       └── products.service.ts
└── test/
    ├── jest-e2e.json
    └── products.e2e-spec.ts              # cần PostgreSQL đang chạy
```

## Chạy và kiểm tra

Làm theo mục 3 của `README.md` (cài, `.env`, migrate, seed). Sau đó:

```powershell
npm run test        # unit test, không cần CSDL
npm run test:e2e    # e2e, cần PostgreSQL và DATABASE_URL đúng
npm run dev:api     # rồi mở http://localhost:4000/products
```

Test e2e tự tạo một sản phẩm riêng rồi xóa đi, không thay đổi 4 sản phẩm seed.

## Gợi ý cho thành viên tiếp theo

- **TV4 (Task 3):** gọi `${NEXT_PUBLIC_API_URL}/products`. Mảng rỗng nghĩa là chưa seed, nên hiển thị empty state.
- **TV5/TV6 (Task 4):** giá hiển thị = `price` + `size.price` + tổng `topping.price` (phụ thu, theo quy ước của TV2). Server sẽ tính lại khi tạo đơn.
- **TV3 (Task 6):** `ProductsModule` đã export `ProductsService` để tra giá phía server; `PositiveIntIdPipe` dùng lại được cho `:id` của đơn hàng.

## Bàn giao

- Thành viên: TV3 • Task: 2 (API) • Nhánh: `feature/tv03` (kế thừa `feature/tv02`)
- URL: `http://localhost:4000/products`, `http://localhost:4000/products/1`
- Người nhận tiếp: TV4
- Vấn đề còn tồn tại: test e2e dùng chung CSDL dev (chưa có CSDL test riêng); Docker Compose do TV6 làm ở Sprint 3.
