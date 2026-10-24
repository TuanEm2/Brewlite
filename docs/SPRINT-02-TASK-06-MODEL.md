# Sprint 2 — Task 6 (model): Order/OrderItem, DTO và service đơn PENDING (TV3)

## User Story / Goal

Là khách hàng, sau khi chọn đồ uống vào giỏ, tôi muốn tạo đơn hàng để thanh toán. TV3 dựng phần dữ liệu và nghiệp vụ tạo đơn; TV4 làm `POST /orders` (Task 6 – API) dựa trên phần này.

## Acceptance Criteria (theo tài liệu BrewLite, Task 6 và mục 12.2)

- [x] Model `Order`, `OrderItem` có quan hệ với `Product`, `User`; migration `20261023093000_order_model_task6`.
- [x] DTO `CreateOrderDto` validate bằng `class-validator`, đúng dữ liệu giỏ hàng TV2 gửi.
- [x] `OrdersService.createPending` tự tính giá phía server, lưu đơn trạng thái `PENDING`, trả mã đơn.
- [x] Test: unit (tính giá, DTO) và integration trên PostgreSQL.
- [x] Đã chạy `npm run typecheck`, `npm run test` (32), `npm run test:e2e` (23), `npm run build`, migrate trên CSDL sạch (23/10/2026).

## Thay đổi CSDL

Chỉ đổi hai model của Task 6; `Product`, `User`, `Payment` giữ nguyên.

| Model | Trường | Ghi chú |
|---|---|---|
| `Order` | `userId Int?` | Để trống được cho tới khi có Auth (Task 7). Route đặt đơn sẽ bắt buộc đăng nhập bằng guard (TV6) |
| `Order` | `discount Int @default(0)`, `voucherCode String?` | Chừa cho voucher (Task 10, TV5). `total` = tổng `lineTotal` − `discount` |
| `Order` | `idempotencyKey String? @unique` | Chừa cho chống tạo đơn trùng (Task 10, TV1) |
| `Order` | `updatedAt` | Thời điểm đổi trạng thái gần nhất (Task 10) |
| `OrderItem` | `toppings Json` | Topping đã chọn kèm phụ thu, ví dụ `[{ "name": "Kem", "price": 10000 }]` |
| `OrderItem` | `unitPrice Int` | Đơn giá tại lúc đặt; `lineTotal` = `unitPrice` × `qty` |

Sau khi merge, mỗi thành viên chạy:

```powershell
npm install
npm run prisma:deploy -w @brewlite/backend
```

## Dữ liệu vào: `CreateOrderDto`

```json
{
  "items": [
    { "productId": 3, "size": "M", "toppings": [], "quantity": 1 },
    { "productId": 4, "size": "L", "toppings": ["Kem", "Trân châu"], "quantity": 2 }
  ]
}
```

| Trường | Quy tắc |
|---|---|
| `items` | Mảng 1–50 dòng |
| `productId` | Số nguyên dương |
| `size` | `S`, `M` hoặc `L` |
| `toppings` | Mảng tên topping, có thể rỗng, không trùng, không chuỗi rỗng |
| `quantity` | Số nguyên 1–99 |

Không có trường giá hay tổng tiền: server không tin giá từ frontend.

## Nghiệp vụ: `OrdersService.createPending(userId, dto)`

1. Lấy các sản phẩm trong đơn bằng một truy vấn (`ProductsService.findManyByIds`).
2. Sản phẩm không tồn tại → `404`. Tổng số lượng của một sản phẩm (cộng mọi dòng) vượt `stock` → `409`.
3. Tính giá bằng `pricing.ts`: đơn giá = giá gốc + phụ thu size + tổng phụ thu topping. Size/topping không thuộc sản phẩm hoặc topping lặp → `400`.
4. Ghi `Order` và mọi `OrderItem` trong cùng một transaction, trạng thái `PENDING`.
5. Trả `OrderResponseDto`:

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

Service **chỉ kiểm tra** tồn kho, **không trừ kho**. Trừ kho bằng transaction + optimistic locking (cột `Product.version`) là Task 10 của TV4.

## Cấu trúc code

```text
backend/
├── prisma/migrations/20261023093000_order_model_task6/
├── src/orders/
│   ├── dto/create-order.dto.ts        # dữ liệu vào + class-validator
│   ├── dto/create-order.dto.spec.ts   # 11 test validate
│   ├── dto/order-response.dto.ts      # dữ liệu trả về
│   ├── pricing.ts                     # tính giá thuần, không cần CSDL
│   ├── pricing.spec.ts                # 7 test
│   ├── orders.service.ts              # createPending
│   └── orders.module.ts               # export OrdersService, chưa có controller
├── src/products/products.service.ts   # thêm findManyByIds
└── test/orders.e2e-spec.ts            # 5 test integration, cần PostgreSQL
```

Thư viện mới: `class-validator`, `class-transformer` (đề yêu cầu class-validator).

## Gợi ý cho thành viên tiếp theo

- **TV4 (Task 6 – API):** tạo `OrdersController` trong `src/orders/`, thêm vào `controllers` của `OrdersModule`, và bật `ValidationPipe` (ví dụ `app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))` trong `main.ts`):

  ```ts
  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.createPending(null, dto); // TV6 thay null bằng id user từ JWT
  }
  ```

- **TV4 (Task 10 – tồn kho):** thay bước kiểm tra tồn kho bằng trừ kho có khóa trong cùng transaction tạo đơn.
- **TV1 (Task 8/10):** dùng `Order.idempotencyKey`. Lưu ý `Payment.orderId` đang `@unique` (một đơn chỉ một bản ghi thanh toán), có thể vướng luồng `PAYMENT_FAILED → PENDING` thử lại theo mục 9.1 của đề.
- **TV5 (Task 10 – voucher):** ghi `discount`, `voucherCode` và trừ vào `total`.
- **TV3 (Task 10 – state machine):** mọi thay đổi `Order.status` sẽ đi qua `assertTransition`.

## Bàn giao

- Thành viên: TV3 • Task: 6 (model) • Nhánh: `feature/tv03`
- Kế thừa: code Task 5 của TV2 nhận trước (TV2 chưa push lúc 23/10 chiều). Backend và schema trong bản đó giống `feature/tv03`, nên không cần đổi gì; khi TV2 push sẽ merge `origin/feature/tv02`.
- Người nhận tiếp: TV4
- Vấn đề còn tồn tại: chưa có `POST /orders` (TV4); `userId` để trống được cho tới Task 7.
