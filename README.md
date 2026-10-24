# BrewLite ☕ | Software Engineering — Sprint 1–2 + Sprint 3 TV1

> **Cập nhật Sprint 3 (TV1):** Source tích hợp Sprint 1–2; TV1 bổ sung Mock Payment, idempotency và trang thanh toán thử. Xem hướng dẫn **`docs/SPRINT-03-TASK-08-TV1.md`**. Các checklist Sprint 1 bên dưới là tài liệu lịch sử, có thể chưa được cập nhật. **Không chạy seed/reset trên PostgreSQL có dữ liệu cần giữ.**

BrewLite là dự án **ứng dụng đặt đồ uống, thanh toán không tiền mặt** của nhóm môn Công nghệ Phần mềm. Dự án sử dụng **Next.js (frontend)** và **NestJS (backend)** theo yêu cầu của đề bài. Hiện có **nền tảng dự án (TV1, Task 1)** và **cơ sở dữ liệu PostgreSQL + Prisma (TV2, Task 2)**; đây chưa phải ứng dụng đặt hàng hoàn chỉnh.

## 1. Phạm vi bàn giao TV1

- [x] Monorepo một GitHub repository với hai thư mục `frontend/`, `backend/`.
- [x] Next.js + TypeScript + Tailwind CSS có trang chào và kiểm tra API.
- [x] NestJS + TypeScript có `GET /api` và `GET /api/health`.
- [x] `npm workspaces` để cài/thực thi cùng repo.
- [x] `.gitignore`, `.env.example`, README, CONTRIBUTING và ví dụ unit test.
- [x] PostgreSQL, Prisma, schema Product và dữ liệu mẫu (TV2, xem mục 7).
- [ ] API sản phẩm `/products` (TV3), menu, giỏ hàng, auth, payment... (những thành viên/Sprint sau).

## 2. Điều kiện chạy

Cài **Node.js 24.15+ (khuyến nghị)** hoặc **Node.js 22.22.3+**, và npm 10+. Kiểm tra:

```bash
node -v
npm -v
```

Cài Git và VS Code nếu chưa có. Từ Task 2, backend **cần PostgreSQL 14+ đang chạy** (cài từ https://www.postgresql.org/download/, nhớ mật khẩu của user `postgres`). Nếu PostgreSQL chưa chạy, backend sẽ báo lỗi kết nối và dừng ngay khi khởi động.

## 3. Cài và chạy (Windows / PowerShell / VS Code Terminal)

Mở terminal tại thư mục gốc có file `package.json` của BrewLite, chạy:

```powershell
npm install
Copy-Item frontend/.env.example frontend/.env.local
Copy-Item backend/.env.example backend/.env
# Mở backend/.env và sửa DATABASE_URL cho đúng user/mật khẩu PostgreSQL trên máy bạn (xem mục "Chuẩn bị cơ sở dữ liệu")
npm run prisma:migrate -w @brewlite/backend
npm run prisma:seed -w @brewlite/backend
npm run dev
```

> Linux/macOS: thay hai lệnh `Copy-Item` bằng `cp`.
>
> Repo đã có **package-lock.json**; dùng `npm ci` thay cho `npm install` nếu muốn cài đúng phiên bản dependency. **Không commit `node_modules`**.
>
> Sau mỗi lần `npm install`/`npm ci`, Prisma Client được sinh tự động (script `postinstall`). Nếu gặp lỗi `@prisma/client did not initialize yet` hoặc `typecheck` báo thiếu `Prisma`, chạy tay: `npm run prisma:generate -w @brewlite/backend`.

### Chuẩn bị cơ sở dữ liệu (TV2)

1. Tạo database rỗng, ví dụ bằng `psql` hoặc pgAdmin:

   ```powershell
   psql -U postgres -c "CREATE DATABASE brewlite_db;"
   ```

2. Trong `backend/.env`, đặt `DATABASE_URL` theo mẫu `postgresql://USER:MAT_KHAU@localhost:5432/brewlite_db?schema=public`. File `.env` đã được Git bỏ qua, **không đưa mật khẩu thật lên GitHub**.
3. Áp dụng migration để tạo bảng: `npm run prisma:migrate -w @brewlite/backend`.
4. Nạp 4 sản phẩm mẫu: `npm run prisma:seed -w @brewlite/backend`. Seed **xóa sạch Product/Order/OrderItem/Payment** rồi nạp lại và đặt id về 1, nên chạy lại bao nhiêu lần sản phẩm vẫn có id 1–4. Seed từ chối chạy khi `NODE_ENV=production`.
5. Xem dữ liệu: `npm run prisma:studio -w @brewlite/backend`.

Các lệnh Prisma khác (chạy trong workspace backend): `prisma:generate`, `prisma:deploy` (áp dụng migration có sẵn, dùng cho Docker/CI), `prisma:reset` (xóa DB, chạy lại toàn bộ migration và seed), `prisma:push`.

Mở:

- **Frontend:** http://localhost:3000
- **Backend hello:** http://localhost:4000/api
- **Backend health:** http://localhost:4000/api/health

Khi API khởi động, trang frontend sẽ tự kiểm tra backend và hiển thị "Đã kết nối". Backend chỉ khởi động được khi PostgreSQL đang chạy và `DATABASE_URL` đúng.

### Chạy riêng từng phần

**Terminal 1** (frontend):

```bash
npm run dev:web
```

**Terminal 2** (backend):

```bash
npm run dev:api
```

Các lệnh kiểm tra bổ sung:

```bash
npm run typecheck
npm run test
npm run build
npm run test:e2e   # cần PostgreSQL đang chạy (TV3, Task 2)
```

**Ghi chú:** `npm run build` cần mạng tải dependency khi cài lần đầu. Do môi trường tạo gói không truy cập được npm registry, bạn cần chạy các lệnh trên máy của mình để xác nhận build thực tế trước khi push.

## 4. Cấu trúc dự án

```text
BrewLite/
├── .github/
│   └── pull_request_template.md
├── docs/
│   ├── SPRINT-01-TASK-01.md
│   ├── SPRINT-01-TASK-02.md
│   ├── SPRINT-01-TASK-02-API.md
│   ├── SPRINT-02-TASK-06-MODEL.md
│   ├── SPRINT-03-TASK-10-STATE-MACHINE.md
│   └── GIT-WORKFLOW.md
├── frontend/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── public/favicon.svg
│   ├── .env.example
│   └── package.json
├── backend/
│   ├── prisma/
│   │   ├── migrations/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   │   ├── common/pipes/
│   │   │   └── positive-int-id.pipe.ts
│   │   ├── prisma/
│   │   │   ├── prisma.module.ts
│   │   │   └── prisma.service.ts
│   │   ├── orders/
│   │   │   ├── dto/
│   │   │   ├── pricing.ts
│   │   │   ├── orders.module.ts
│   │   │   └── orders.service.ts
│   │   ├── products/
│   │   │   ├── dto/product-response.dto.ts
│   │   │   ├── products.controller.ts
│   │   │   ├── products.module.ts
│   │   │   └── products.service.ts
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── app.controller.ts
│   │   ├── app.service.ts
│   │   └── app.controller.spec.ts
│   ├── test/
│   │   ├── jest-e2e.json
│   │   ├── orders.e2e-spec.ts
│   │   └── products.e2e-spec.ts
│   ├── .env.example
│   └── package.json
├── .env.example
├── .gitignore
├── CONTRIBUTING.md
├── package.json
└── README.md
```

## 5. API hiện có

| Method | Địa chỉ | Mô tả |
|---|---|---|
| `GET` | `/api` | Trả thông báo chào từ NestJS |
| `GET` | `/api/health` | Trả JSON xác nhận backend hoạt động |
| `GET` | `/products` | Danh sách sản phẩm (menu): `id`, `name`, `price`, `imageUrl` (TV3, Task 2) |
| `GET` | `/products/:id` | Chi tiết sản phẩm, thêm `stock`, `sizes`, `toppings`; `400` id sai, `404` không có (TV3, Task 2) |

`/products` và `/products/:id` cũng có ở `/api/products`, `/api/products/:id`. Chi tiết và ví dụ JSON trong `docs/SPRINT-01-TASK-02-API.md`.

Ví dụ kết quả từ `GET /api/health`:

```json
{
  "status": "ok",
  "service": "BrewLite API",
  "timestamp": "2026-10-21T00:00:00.000Z"
}
```

`timestamp` thay đổi ở mỗi lần gọi. CORS được giới hạn theo `FRONTEND_URL` (mặc định localhost:3000).

## 6. Hướng dẫn TV1 push lần đầu

**Nếu bạn đã tạo repo `BrewLite` trên GitHub có README**: clone repo đó trước, sau đó chép **toàn bộ nội dung bên trong ZIP** vào thư mục repo đã clone. Không copy thư mục `.git` (ZIP không có thư mục này).

```bash
git clone https://github.com/USERNAME/BrewLite.git
cd BrewLite
# Chép tất cả file trong ZIP vào thư mục BrewLite ở đây
npm install
# Tạo frontend/.env.local và backend/.env (theo hướng dẫn ở mục 3)
npm run dev
npm run typecheck
npm run test

git switch -c feature/tv01
git add .
git commit -m "feat(task-01): initialize Next.js NestJS monorepo"
git push -u origin feature/tv01
```

Nếu `git switch -c feature/tv01` báo nhánh tồn tại, dùng `git switch feature/tv01`. Tài khoản GitHub cần được cấu hình bằng tên và email thật của TV1; `.env.local`/`.env` được Git bỏ qua.

**TV2 lấy nhánh TV1 sau khi TV1 push thành công**:

```bash
git clone https://github.com/USERNAME/BrewLite.git
cd BrewLite
git fetch origin
git switch -c feature/tv02 origin/feature/tv01
npm install
```

Khi repo đã có `package-lock.json` do TV1 commit, TV2 có thể dùng `npm ci` thay cho `npm install` để cài tái lập chính xác.

## 7. Bàn giao TV2 → TV3 (Task 2 — cơ sở dữ liệu)

**TV2 đã làm** (chi tiết và cách kiểm tra trong `docs/SPRINT-01-TASK-02.md`):

- [x] PostgreSQL + Prisma 6: `backend/prisma/schema.prisma` và các migration trong `backend/prisma/migrations/`.
- [x] `PrismaModule` (global) và `PrismaService` trong `backend/src/prisma/`, đã import vào `AppModule`; TV3 chỉ cần inject `PrismaService`.
- [x] Các bảng theo mục 12.2 của đề: `Product`, `User`, `Order`, `OrderItem`, `Payment` và enum `OrderStatus`.
- [x] `Product` có `stock`, `version` (dùng cho optimistic locking ở Task 10), `sizes`, `toppings` (JSON).
- [x] Seed 4 sản phẩm đúng wireframe của đề: Cà phê sữa 35.000đ, Americano 40.000đ, Cappuccino 45.000đ, Trà đào 39.000đ.

**Quy ước giá (đề xuất, cần cả nhóm thống nhất):** đơn giá = `product.price` + `size.price` + tổng `price` của các topping đã chọn; `lineTotal` = đơn giá × `qty`. `price` trong `sizes`/`toppings` là **phụ thu** (VND), không phải giá tuyệt đối. Giá luôn do server tính lại.

**TV3 làm tiếp:** `GET /products` (id, name, price, imageUrl), `GET /products/:id` (thêm stock, sizes, toppings) và trả 404 khi không có sản phẩm; truy vấn bằng `PrismaService`. Làm theo mục 3 (cài, `.env`, migrate, seed) trước khi code.

> **Lưu ý về API:** đề yêu cầu `GET /products`, `GET /products/:id` ở Task 2. Phần này được giao TV3 trong lịch nhóm; hai endpoint `/api` trong Task 1 chỉ là endpoint thử nghiệm. Cần thống nhất URL API thật với nhóm khi bắt đầu Task 2.

## 8. Bàn giao TV3 → TV4 (Task 2 — API sản phẩm)

**TV3 đã làm** (chi tiết, ví dụ JSON và cách kiểm tra trong `docs/SPRINT-01-TASK-02-API.md`):

- [x] `GET /products` và `GET /products/:id` truy vấn qua `PrismaService`; trả `400` khi id sai, `404` khi không có sản phẩm.
- [x] Thống nhất URL API: phục vụ cả `/products` (đúng đề) và `/api/products` (khớp prefix `api` của Task 1).
- [x] Unit test cho kiểm tra id (`npm run test`) và e2e cho hai endpoint (`npm run test:e2e`, cần PostgreSQL).

**TV4 làm tiếp:** trang Menu gọi `${NEXT_PUBLIC_API_URL}/products`, hiển thị hình/tên/giá, có loading và empty state.

## 9. Bàn giao TV4 → TV5 (Task — Trang chi tiết sản phẩm & Tùy chọn)

**TV4 đã làm:**
- [x] Xây dựng trang Menu gọi API `${NEXT_PUBLIC_API_URL}/products`, hiển thị danh sách hình ảnh, tên, giá món ăn cùng với trạng thái loading và empty state.

**TV5 làm tiếp:**
- [x] Kế thừa kết quả từ TV4 để phát triển trang chi tiết sản phẩm.
- [x] Xây dựng giao diện cho phép người dùng chọn size món (S / M / L).
- [x] Cho phép người dùng chọn thêm các loại topping đi kèm.
- [x] Tự động tính toán và hiển thị chính xác tổng giá lựa chọn dựa trên giá cơ bản, phụ thu size và topping.
- [x] Thực hiện commit code và đẩy nhánh lên Git với tên: `feature/tv05`.

## 10. Bàn giao TV3 → TV4 (Task 6 — model đơn hàng)

**TV3 đã làm** (chi tiết, ví dụ JSON và cách kiểm tra trong `docs/SPRINT-02-TASK-06-MODEL.md`):

- [x] Migration `order_model_task6`: `Order` thêm `discount`, `voucherCode`, `idempotencyKey`, `updatedAt`, `userId` để trống được; `OrderItem` thêm `toppings`, `unitPrice`.
- [x] `CreateOrderDto` (class-validator) đúng dữ liệu giỏ hàng: `productId`, `size`, `toppings`, `quantity`.
- [x] `OrdersService.createPending`: tự tính giá, kiểm tra sản phẩm/size/topping/tồn kho, lưu đơn `PENDING` trong một transaction.
- [x] 18 unit test (`npm run test`) và 5 integration test (`npm run test:e2e`, cần PostgreSQL).

Sau khi merge: `npm install` rồi `npm run prisma:deploy -w @brewlite/backend`.

**TV4 làm tiếp:** `POST /orders` gọi `OrdersService.createPending`, bật `ValidationPipe`, trả mã đơn và trạng thái `PENDING`.

## 11. Bàn giao TV3 → TV4, TV5 (Task 10 — Order State Machine)

**TV3 đã làm** (sơ đồ, quy tắc và cách kiểm tra trong `docs/SPRINT-03-TASK-10-STATE-MACHINE.md`):

- [x] `backend/src/orders/order-state.ts`: bảng chuyển trạng thái đúng mục 9.1 của đề, `assertTransition` chặn chuyển sai (409); `COMPLETED`, `CANCELLED` là trạng thái kết thúc.
- [x] `OrdersService.changeStatus`: đổi sang `PREPARING`, `READY`, `COMPLETED`, `CANCELLED`, chống ghi đè khi hai yêu cầu cùng lúc.
- [x] Refactor thanh toán của TV1: mọi thay đổi `PAID`/`PAYMENT_FAILED` đi qua máy trạng thái; đơn `PAYMENT_FAILED` thử lại về `PENDING` theo sơ đồ.
- [x] 67 unit test (đủ 49 cặp trạng thái) và 11 integration test trên PostgreSQL.

**TV4, TV5 làm tiếp:** trừ tồn kho (TV4) và cộng điểm loyalty chỉ khi đơn sang `PAID` (TV5), dùng `assertTransition`/`changeStatus` khi đổi trạng thái.
