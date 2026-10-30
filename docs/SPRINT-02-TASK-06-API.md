# Sprint 2 — Task 6 (API): Lớp HTTP Controller và E2E Test cho POST /orders (TV4)

## User Story / Goal

Là khách hàng, sau khi chọn đồ uống vào giỏ hàng, tôi muốn gửi yêu cầu đặt hàng lên server thông qua route `POST /orders` để hệ thống khởi tạo đơn hàng `PENDING` và trả về thông tin chi tiết đơn hàng. TV4 xây dựng API controller, kích hoạt validation toàn cục và hoàn thiện bộ kiểm thử E2E dựa trên logic nghiệp vụ do TV3 đã chuẩn bị.

## Acceptance Criteria (theo tài liệu BrewLite, Task 6 và mục 12.2)

- [x] Tạo `OrdersController` phục vụ hai đường dẫn `@Controller(['orders', 'api/orders'])` chứa route `@Post()`.
- [x] Bật `ValidationPipe` toàn cục (`useGlobalPipes`) trong `main.ts` hỗ trợ `whitelist`, `forbidNonWhitelisted`, và `transform`.
- [x] Tích hợp `OrdersController` vào `controllers` của `OrdersModule`.
- [x] Đã kiểm thử E2E cho API `POST /orders` phủ đầy đủ các kịch bản (201 Created, 400 Bad Request, 404 Not Found, 409 Conflict).
- [x] Đã chạy thành công `npm run typecheck`, `npm run test`, `npm run test:e2e` (23/23 passing) và `npm run build` trên cơ sở dữ liệu PostgreSQL (`brewlite_db`).

## Thay đổi Codebase Backend

Toàn bộ model, migration và DTO do TV3 khởi tạo được giữ nguyên. TV4 hoàn thiện lớp Controller và E2E Test.

| File / Module | Thay đổi | Ghi chú |
|---|---|---|
| `src/orders/orders.controller.ts` | Tạo mới | Định nghĩa route `POST /` tiếp nhận `CreateOrderDto` và gọi `ordersService.createPending(null, dto)` |
| `src/orders/orders.module.ts` | Khai báo Controller | Thêm `OrdersController` vào mảng `controllers` |
| `src/main.ts` | Khởi tạo Pipe | Bật `app.useGlobalPipes(new ValidationPipe({...}))` để chặn dữ liệu rác |
| `test/orders.e2e-spec.ts` | Bổ sung Test Cases | Hoàn thiện 5 kịch bản kiểm thử tích hợp E2E kết nối PostgreSQL |

Sau khi checkout nhánh của TV4, các thành viên thực thi lệnh:

```powershell
npm install
npm run prisma:deploy -w @brewlite/backend
```

## Dữ liệu vào & Validation Rule (`POST /orders`)

```json
{
  "items": [
    { "productId": 3, "size": "M", "toppings": [], "quantity": 1 },
    { "productId": 4, "size": "L", "toppings": ["Kem", "Trân châu"], "quantity": 2 }
  ]
}
```

### Xử lý Validation via `ValidationPipe`

| Trường hợp request | Phản hồi từ Server |
|---|---|
| Body hợp lệ | `201 Created` trả về thông tin đơn `PENDING` |
| Thừa trường không khai báo trong DTO (VD: `"price": 1000`) | `400 Bad Request` (Do `forbidNonWhitelisted: true`) |
| Định dạng sai (Size không thuộc S/M/L, quantity $\le 0$) | `400 Bad Request` (Message mô tả chi tiết từ `class-validator`) |
| Sản phẩm không tồn tại (`productId` không có trong CSDL) | `404 Not Found` |
| Số lượng đặt vượt quá tổng `stock` trong CSDL | `409 Conflict` |

## Điểm cuối HTTP & Cấu trúc Phản hồi

### Request Header
`Content-Type: application/json`

### Phản hồi thành công (`201 Created`):

```json
{
  "id": 1042,
  "status": "PENDING",
  "total": 178000,
  "discount": 0,
  "createdAt": "2026-10-23T09:30:00.000Z",
  "items": [
    { "id": 1, "productId": 3, "size": "M", "toppings": [], "quantity": 1, "unitPrice": 50000, "lineTotal": 50000 },
    { "id": 2, "productId": 4, "size": "L", "toppings": [{ "name": "Kem", "price": 10000 }, { "name": "Trân châu", "price": 5000 }], "quantity": 2, "unitPrice": 64000, "lineTotal": 128000 }
  ]
}
```

## Cấu trúc Code Hoàn thiện (Task 6 Backend)

```text
backend/
├── src/
│   ├── main.ts                         # Kích hoạt ValidationPipe toàn cục
│   └── orders/
│       ├── dto/create-order.dto.ts     # DTO validate
│       ├── dto/order-response.dto.ts   # DTO response
│       ├── pricing.ts                  # Logic tính giá
│       ├── orders.service.ts           # Logic tạo đơn (createPending)
│       ├── orders.controller.ts        # Controller vừa tạo (Task 6 - TV4)
│       └── orders.module.ts            # Tích hợp controller & service
└── test/
    ├── products.e2e-spec.ts            # E2E Test Products
    └── orders.e2e-spec.ts              # E2E Test Orders (23/23 passed)
```

## Gợi ý cho các thành viên tiếp theo

- **TV5 (Task 6 – Frontend Integration):** Đấu nối nút "Đặt hàng" trên UI với `POST /orders`. Parse danh sách item từ Zustand store thành `items: [{ productId, size, toppings, quantity }]`. Không gửi giá tiền lên.
- **TV6 (Task 7 – Auth):** Thêm `@UseGuards(JwtAuthGuard)` vào `OrdersController` và thay tham số `null` trong `createPending(req.user.id, dto)` bằng ID người dùng thực tế.
- **TV4 (Task 10 – Tồn kho & Transaction):** Nâng cấp `createPending` để trừ tồn kho thực tế bằng Optimistic Locking (`Product.version`) trong cùng một Prisma Transaction.

## Bàn giao

- Thành viên: TV4 • Task: 6 (API `POST /orders`) • Nhánh: `feature/tv04`
- Kế thừa: Code base từ TV3 (`feature/tv03`), bổ sung `OrdersController` và kích hoạt validation toàn hệ thống.
- Người nhận tiếp: TV5 (Tích hợp Frontend) & TV6 (Bảo vệ API bằng JWT Auth).
- Trạng thái kiểm thử: 23/23 E2E test cases pass 100% trên môi trường local PostgreSQL v18.