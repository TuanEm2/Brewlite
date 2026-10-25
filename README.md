# BrewLite — Website đặt đồ uống | Công nghệ Phần mềm

BrewLite là MVP đặt đồ uống không tiền mặt theo đề **BrewLite Ver 1.0**. Dự án gồm **Next.js 16 + React 19** (`frontend`), **NestJS 11** (`backend`), **PostgreSQL 16 + Prisma 6**, Zustand và thanh toán **giả lập** (không thu tiền thật).

## Chức năng đã triển khai

- Menu đồ uống từ CSDL, xem chi tiết, chọn size S/M/L, topping và tính phụ thu.
- Giỏ hàng Zustand: thêm/sửa/xóa món, số lượng, tổng tiền và badge.
- Đăng ký/đăng nhập bcrypt + JWT; bảo vệ API tạo đơn và lịch sử đơn.
- Tạo đơn `PENDING`, kiểm tra dữ liệu và tính lại giá ở backend, áp voucher demo `BREW10`.
- Thanh toán thử qua Ví/Thẻ với `SUCCESS`/`FAILURE`, chống trùng bằng idempotency key.
- Máy trạng thái đơn hàng, transaction/optimistic locking chống bán vượt tồn kho.
- Tích điểm sau khi `PAID`, xem lịch sử/xác nhận đơn, hủy đơn hợp lệ và hoàn tồn kho/điểm (trong **mock**).
- Docker Compose 3 dịch vụ, unit test và PostgreSQL integration/e2e test.

> **Giới hạn**: Đây là đồ án MVP. Thanh toán không kết nối ngân hàng hoặc ví thật; hủy đơn đã `PAID` chỉ hoàn tồn kho/điểm trong hệ thống mô phỏng. Chưa có quản trị sản phẩm, nhân viên pha chế, tự động hết hạn đơn chờ thanh toán, hay chính sách hoàn tiền thật (không bắt buộc cho MVP theo đề).

## Yêu cầu môi trường

- Node.js `>=22.22.3` (hoặc Node 24 tương thích), npm `>=10`.
- PostgreSQL `14+` cho cách chạy local, hoặc Docker Desktop với Compose cho cách Docker.
- Chạy ở **thư mục gốc** chứa `package.json`.

## Cách A — Docker Compose (khuyến nghị khi demo)

1. Sao chép `.env.docker.example` thành **`.env` ở thư mục gốc**. Đặt mật khẩu PostgreSQL riêng (chỉ chữ/số/dấu `-` hoặc `_`, tránh ký tự phải URL-encode) và JWT secret ngẫu nhiên tối thiểu 32 byte. Có thể tạo JWT key bằng:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. Chạy:

   ```bash
   docker compose up --build -d
   docker compose ps
   docker compose logs -f backend
   ```

3. Truy cập http://localhost:3000 (website) và http://localhost:4000/api/health (healthcheck). Docker tự áp dụng Prisma migrations bằng `prisma migrate deploy` (không dùng `db push --accept-data-loss`). PostgreSQL chỉ mở trong mạng Compose, không mở cổng DB trên máy chủ.

4. Dừng (giữ dữ liệu): `docker compose down`. **Không dùng `docker compose down -v` nếu cần giữ database**. Nếu thay mật khẩu của PostgreSQL trong `.env` sau khi volume đã được tạo, phải cập nhật mật khẩu trong database tương ứng; sửa `.env` riêng sẽ không đổi mật khẩu trong volume cũ.

## Cách B — Chạy local (PowerShell, Windows)

```powershell
npm ci
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env.local
```

- Tạo một PostgreSQL database trống, ví dụ `brewlite_db`.
- Sửa `DATABASE_URL` trong `backend/.env` theo mật khẩu/database của bạn.
- Tạo `JWT_SECRET` dài từ 32 byte trong `backend/.env`.

```powershell
npm run prisma:deploy -w @brewlite/backend
npm run dev
```

Vào http://localhost:3000. Backend mặc định ở http://localhost:4000. Ở lần đầu kết nối database rỗng, ứng dụng tạo 4 sản phẩm mẫu nếu chưa có sản phẩm. Nếu cần seed thủ công, chỉ dùng `npm run prisma:seed -w @brewlite/backend` trên **database thử nghiệm mới, không có dữ liệu cần giữ** vì seed xóa dữ liệu demo cũ.

## Kiểm thử

```bash
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

- `npm run test`: các unit test không cần kết nối PostgreSQL.
- `npm run test:e2e`: cần PostgreSQL đang chạy, `DATABASE_URL` và `JWT_SECRET` hợp lệ, schema đã migrate. Bộ test có tạo/xóa dữ liệu thử, **không chạy trên database production**.
- `npm run build`: build cả NestJS lẫn Next.js; cần cài dependency trước.
- CI trong `.github/workflows/ci.yml` chạy typecheck, unit, PostgreSQL e2e và build trên GitHub Actions.
- Tiêu chí API `<500ms` trong đề **cần đo trên máy demo**. Chạy `node scripts/check-api-latency.mjs` khi backend đã khởi động (kết quả tùy máy/DB); không tự khẳng định đạt nếu chưa đo. Kiểm tra giao diện thực tế trên Chrome/Edge/Firefox trước khi nộp.

## API chính

| Method | Endpoint | Xác thực | Ghi chú |
|---|---|---|---|
| GET | `/products`, `/products/:id` | Không | Menu và chi tiết |
| POST | `/auth/register`, `/auth/login` | Không | Đăng ký/đăng nhập |
| POST | `/orders` | JWT | Tạo đơn PENDING |
| GET | `/orders/:id`, `/orders/me` | JWT | Chi tiết/lịch sử riêng |
| POST | `/payments` | JWT | Thanh toán giả lập; cùng xử lý với `/payments/mock` |
| POST | `/payments/mock` | JWT | Alias tương thích trang checkout cũ |
| POST | `/orders/:id/cancel` | JWT | Hủy đơn thuộc tài khoản, chỉ ở trạng thái được phép |
| GET | `/api/health` | Không | Kiểm tra backend |

Các route `/api/products`, `/api/orders`, `/api/payments`... được cung cấp dưới dạng alias tương ứng. Quy trình: `PENDING → PAID → PREPARING → READY → COMPLETED`; thanh toán lỗi `PAYMENT_FAILED` có thể thử lại, và hủy khi trạng thái cho phép. Trạng thái pha chế có service/test ở backend, chưa có giao diện Barista (phần mở rộng ngoài MVP).

## Kịch bản demo 5 phút

1. Mở Menu → Cappuccino → chọn size L và topping Kem → thêm vào giỏ.
2. Vào giỏ → nhập voucher `BREW10` → tạo đơn (đăng ký/đăng nhập nếu cần).
3. Chọn Ví hoặc Thẻ → thử thanh toán thất bại rồi thử thành công → kiểm tra trạng thái `PAID` và mã đơn.
4. Vào **Lịch sử đơn** → xem đúng tổng tiền/chi tiết, điểm thưởng; thử hủy đơn demo nếu cần chứng minh xử lý kho.
5. Giải thích idempotency (bấm lại cùng yêu cầu không tạo thanh toán trùng), concurrency/optimistic locking và Docker/Prisma.

## Scrum và bàn giao

- Mã gốc triển khai qua 3 Sprint, sáu thành viên; lịch sử Git trên nhánh `main` và các nhánh `feature/tv01`…`feature/tv06`.
- Tài liệu kỹ thuật theo từng task ở `docs/SPRINT-*.md`; hướng dẫn minh chứng Scrum ở `docs/SCRUM-NGHIEM-THU.md`.
- **Không tự coi Scrum artifacts là hoàn tất**: nhóm cần bổ sung Product/Sprint Backlog, Burndown với số liệu thực, Sprint Review, Retrospective và biên bản nghiệm thu trước khi nộp.

## An toàn dữ liệu

- Không commit `.env` chứa secret. Thay JWT secret và mật khẩu demo trước khi đưa web ra mạng.
- Không chạy `prisma migrate reset`, `prisma db push --accept-data-loss`, `prisma:seed`, hoặc `docker compose down -v` trên dữ liệu cần giữ.
- Giữ bản sao database trước khi thực hiện migration quan trọng. Cổng backend/frontend Docker chỉ bind localhost (dành cho demo máy cá nhân).
