# Sprint 1 — Task 2: Cơ sở dữ liệu và dữ liệu mẫu (TV2)

## User Story / Goal

Là nhóm phát triển, chúng tôi cần một cơ sở dữ liệu PostgreSQL dùng Prisma và dữ liệu mẫu cho menu, để TV3 xây `GET /products` và các thành viên sau dùng chung một mô hình dữ liệu.

## Acceptance Criteria (theo tài liệu BrewLite, phần dữ liệu của Task 2)

- [x] PostgreSQL + Prisma được cấu hình; `DATABASE_URL` mẫu có trong `backend/.env.example`.
- [x] Schema có `Product(id, name, price, imageUrl, stock)` và các thực thể tối thiểu ở mục 12.2 của đề.
- [x] Có migration (`init_schema`, `add_product_version`) và `PrismaService` dùng được trong NestJS.
- [x] Dữ liệu mẫu gồm 4 sản phẩm như wireframe của đề.
- [x] Thiết kế size (S/M/L), topping và tồn kho (`stock`, `version`).
- [x] README có hướng dẫn cài PostgreSQL, migrate, seed.
- [ ] Đã chạy migrate + seed trên PostgreSQL thật và thấy đủ 4 sản phẩm (Prisma Studio).
- [ ] Đã chạy `npm run typecheck`, `npm run test`, `npm run build` không lỗi.
- [ ] Đã push `feature/tv02` và TV3 xác nhận pull được.

## Mô hình dữ liệu

| Bảng | Trường | Ghi chú |
|---|---|---|
| `Product` | `id`, `name`, `price`, `imageUrl`, `stock` (mặc định 100), `version` (mặc định 0), `sizes` (JSON), `toppings` (JSON) | Tiền tính bằng VND, số nguyên |
| `User` | `id`, `email` (duy nhất), `passwordHash`, `loyaltyPoints`, `createdAt` | Dùng từ Task 7 |
| `Order` | `id`, `userId`, `status`, `total`, `createdAt` | `status` mặc định `PENDING` |
| `OrderItem` | `id`, `orderId`, `productId`, `size`, `qty`, `lineTotal` | Xóa theo `Order` (cascade) |
| `Payment` | `id`, `orderId`, `idempotencyKey`, `amount`, `method`, `createdAt` | `orderId` và `idempotencyKey` đều duy nhất |

`OrderStatus`: `PENDING`, `PAID`, `PREPARING`, `READY`, `COMPLETED`, `PAYMENT_FAILED`, `CANCELLED` (khớp sơ đồ máy trạng thái ở mục 9.1 của đề).

## Size, topping và cách tính giá

`Product.sizes` và `Product.toppings` là JSON, mọi sản phẩm mẫu dùng chung một bộ:

```json
{
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

`price` ở đây là **phụ thu** cộng vào giá gốc, không phải giá tuyệt đối.

Quy ước đề xuất cho TV3–TV6 (cần cả nhóm xác nhận): đơn giá = `product.price` + `size.price` + tổng `price` của các topping đã chọn, và `lineTotal` = đơn giá × `qty`. Giá luôn do server tính lại, không tin giá từ frontend.

## Dữ liệu mẫu

Sau khi chạy seed, `id` luôn là 1–4:

| id | Sản phẩm | Giá gốc | Tồn kho |
|---|---|---|---|
| 1 | Cà phê sữa | 35.000đ | 100 |
| 2 | Americano | 40.000đ | 100 |
| 3 | Cappuccino | 45.000đ | 100 |
| 4 | Trà đào | 39.000đ | 100 |

Seed **xóa sạch** `Payment`, `OrderItem`, `Order`, `Product` rồi nạp lại, và từ chối chạy khi `NODE_ENV=production`.

## Chạy và kiểm tra

Xem mục 3 trong `README.md` để cài đặt đầy đủ. Tóm tắt:

```powershell
npm ci
Copy-Item backend/.env.example backend/.env   # rồi sửa DATABASE_URL
npm run prisma:migrate -w @brewlite/backend
npm run prisma:seed -w @brewlite/backend
npm run prisma:studio -w @brewlite/backend     # kiểm tra có 4 sản phẩm
npm run typecheck
npm run test
npm run build
```

## Gợi ý cho thành viên tiếp theo

- **TV3:** `PrismaModule` là global, chỉ cần inject `PrismaService`. Ví dụ:

  ```ts
  @Injectable()
  export class ProductsService {
    constructor(private readonly prisma: PrismaService) {}

    findAll() {
      return this.prisma.product.findMany({
        select: { id: true, name: true, price: true, imageUrl: true },
        orderBy: { id: 'asc' },
      });
    }
  }
  ```

  `GET /products/:id` cần trả thêm `stock`, `sizes`, `toppings` và trả 404 khi không có sản phẩm.
- **TV4 (Task 3):** `imageUrl` đang dùng `placehold.co`. Nếu dùng `next/image`, cần khai báo `images.remotePatterns` trong `frontend/next.config.ts` và kiểm tra ảnh hiển thị được (dịch vụ này mặc định trả ảnh SVG).
- **TV4 (Task 10):** cột `version` dùng cho optimistic locking, ví dụ `updateMany({ where: { id, version, stock: { gte: qty } }, data: { stock: { decrement: qty }, version: { increment: 1 } } })`; nếu `count` bằng 0 thì thử lại hoặc báo hết hàng.
- **TV1 (Task 8):** `Payment.orderId` đang là duy nhất, nghĩa là mỗi đơn chỉ có một bản ghi thanh toán. Nếu muốn lưu từng lần thanh toán lỗi rồi thử lại, bỏ ràng buộc này bằng một migration mới.
- **TV3 (Task 6):** `OrderItem` theo đề chỉ lưu `size`, không lưu topping. Nếu lịch sử đơn cần hiển thị topping, thêm cột mới bằng migration và báo cả nhóm.

## Bàn giao

- Thành viên: TV2 • Task: 2 (cơ sở dữ liệu) • Nhánh: `feature/tv02` (kế thừa `feature/tv01`)
- Mã commit mới: (điền sau khi push)
- URL/trang liên quan: chưa có API sản phẩm; kiểm tra dữ liệu bằng Prisma Studio.
- Người nhận tiếp: TV3
- Vấn đề còn tồn tại: chưa có test tự động cho phần cơ sở dữ liệu (cần PostgreSQL thật); Docker Compose cho PostgreSQL do TV6 làm ở Sprint 3.
