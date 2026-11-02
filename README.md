# BrewLite

Website đặt đồ uống của nhóm 6 thành viên, phát triển qua 3 Sprint. Monorepo dùng Next.js 16, React 19, TypeScript, Zustand, NestJS 11, Prisma 6 và PostgreSQL 16. Hướng dẫn cài đặt, vận hành, kiểm thử và đóng góp được tập trung trong README này.

## Mục lục

- [Chức năng và giới hạn](#chức-năng-và-giới-hạn)
- [Cấu trúc mã nguồn](#cấu-trúc-mã-nguồn)
- [Chạy bằng Docker Compose](#chạy-bằng-docker-compose)
- [Chạy local trên Windows](#chạy-local-trên-windows)
- [Database và kho nguyên liệu](#database-và-kho-nguyên-liệu)
- [Sao lưu và khôi phục database](#sao-lưu-và-khôi-phục-database)
- [Thanh toán mock và payOS](#thanh-toán-mock-và-payos)
- [Triển khai trên Render](#triển-khai-trên-render)
- [API](#api)
- [Kiểm thử và demo](#kiểm-thử-và-demo)
- [Đặc tả checkout](#đặc-tả-checkout)
- [Phân công và quy trình Git](#phân-công-và-quy-trình-git)

## Chức năng và giới hạn

- Menu và chi tiết đồ uống; chọn size S/M/L, topping, xem giá và tồn nguyên liệu theo công thức.
- Giỏ hàng Zustand lưu trong localStorage: thêm, gộp cùng lựa chọn, đổi số lượng, xóa món, xóa hết; tối đa 99 ly mỗi dòng.
- Đăng ký/đăng nhập bcrypt và JWT; API đơn hàng kiểm tra quyền sở hữu.
- Tạo đơn `PENDING`; backend kiểm tra lựa chọn, tính lại giá, giữ/trừ nguyên liệu bằng transaction và optimistic locking.
- Voucher `BREW10`: giảm 10%, tối đa 20.000đ cho đơn từ 50.000đ. Loyalty: 1 điểm mỗi 10.000đ thực trả, làm tròn xuống.
- Thanh toán mock Ví/Thẻ và tích hợp VietQR qua payOS; chống ghi nhận trùng bằng idempotency, row lock và ràng buộc database.
- Lịch sử đơn lưu tên món, giá và lựa chọn tại thời điểm đặt; hủy đơn đủ điều kiện và hoàn nguyên liệu theo snapshot.
- Đối soát payOS, hạn thanh toán mặc định 15 phút; worker nền chỉ chạy khi được bật.

Chưa có trang quản trị sản phẩm hoặc giao diện/API cho barista đổi tiến độ pha chế. Máy trạng thái `PAID → PREPARING → READY → COMPLETED` đã có service và test. Hủy đơn đã có checkout payOS qua API hủy thông thường bị chặn; hoàn tiền thật cần quy trình riêng. Kiểm thử tự động không thay thế xác nhận giao dịch thực tế với nhà cung cấp/ngân hàng.

## Cấu trúc mã nguồn

| Đường dẫn | Nội dung |
|---|---|
| `frontend/app/` | Trang chủ, menu, chi tiết, giỏ, auth, checkout và lịch sử |
| `frontend/store/` | Zustand auth/cart; hàm tính tiền, checkout, ảnh sản phẩm |
| `frontend/public/images/` | Bốn ảnh đồ uống JPG được phục vụ tại `/images/...` |
| `backend/src/auth/` | Đăng ký, đăng nhập, JWT Guard |
| `backend/src/products/` | API menu, chi tiết và khả năng cung ứng nguyên liệu |
| `backend/src/orders/` | Tạo/hủy đơn, giá, voucher, trạng thái và hạn thanh toán |
| `backend/src/payments/` | Mock, payOS Gateway/Service, webhook và expiry worker |
| `backend/prisma/` | Schema, migrations, seed dữ liệu thử nghiệm |
| `backend/src/**/*.spec.ts` | Unit test; gồm các test trực tiếp helper/store frontend |
| `backend/test/` | Integration/E2E với PostgreSQL |
| `docs/diagrams/` | Sơ đồ use case checkout: nguồn PlantUML và SVG |
| `scripts/check-api-latency.mjs` | Đo độ trễ API đang chạy |
| `.github/` | GitHub Actions CI và mẫu Pull Request |
| `docker-compose.yml`, `render.yaml` | Cấu hình chạy/deploy |

Giữ `package-lock.json` để `npm ci` cài đúng dependency; giữ toàn bộ migrations để cập nhật được các database cũ. Các tài liệu Sprint, bàn giao và test frontend lưu trữ cũ có thể tra lại trong lịch sử Git.

## Chạy bằng Docker Compose

Yêu cầu Docker Desktop/Compose. Mở terminal tại thư mục gốc có `package.json` và `docker-compose.yml`.

1. Tạo cấu hình nếu chưa có (PowerShell):

   ```powershell
   if (!(Test-Path .env)) { Copy-Item .env.docker.example .env }
   ```

2. Sửa `.env`: đặt `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_USER`, `JWT_SECRET`. Với URL kết nối Compose hiện tại, dùng mật khẩu gồm chữ, số, `-`, `_` để tránh ký tự cần URL-encode. Giữ `PAYMENT_MODE=mock` khi demo mô phỏng. Tạo JWT secret ngẫu nhiên tối thiểu 32 byte:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. Chạy và kiểm tra:

   ```powershell
   docker compose up --build -d
   docker compose ps
   docker compose logs -f backend
   ```

4. Mở website <http://localhost:3000> và healthcheck <http://localhost:4000/api/health>.

Backend chờ PostgreSQL sẵn sàng rồi tự chạy `prisma migrate deploy` trước khi khởi động. PostgreSQL chỉ có cổng trong mạng Compose; frontend/backend được bind vào localhost. `pgdata` lưu database qua các lần khởi động lại.

```powershell
docker compose down
```

Lệnh trên dừng dịch vụ và giữ volume. `docker compose down -v` xóa volume database. Đổi `POSTGRES_PASSWORD` trong `.env` không tự đổi mật khẩu của database đã tồn tại trong volume.

## Chạy local trên Windows

Yêu cầu Node.js `>=22.22.3`, npm `>=10`, PostgreSQL đang chạy. `.nvmrc` ghi phiên bản Node của dự án. Nếu chưa có source:

```powershell
git clone https://github.com/TuanEm2/Brewlite.git
cd Brewlite
```

Tại thư mục gốc:

```powershell
npm ci
if (!(Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
if (!(Test-Path frontend/.env.local)) { Copy-Item frontend/.env.example frontend/.env.local }
```

Tạo database, ví dụ `brewlite_db`, bằng pgAdmin/psql nếu chưa có. Trong `backend/.env`, cấu hình:

```dotenv
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/brewlite_db?schema=public"
JWT_SECRET=YOUR_RANDOM_SECRET_AT_LEAST_32_BYTES
PORT=4000
FRONTEND_URL=http://localhost:3000
PAYMENT_MODE=mock
```

Trong `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_PAYMENT_MODE=mock
```

`YOUR_PASSWORD` và `YOUR_RANDOM_SECRET_AT_LEAST_32_BYTES` là chỗ cần thay bằng giá trị của máy bạn. Không ghi đè các file `.env` đã có.

```powershell
npm run prisma:deploy -w @brewlite/backend
npm run dev
```

Các lệnh thường dùng:

| Lệnh tại thư mục gốc | Tác dụng |
|---|---|
| `npm run dev` | Chạy frontend và backend cùng lúc |
| `npm run dev:web` | Frontend tại cổng 3000 |
| `npm run dev:api` | Backend mặc định cổng 4000 |
| `npm run prisma:generate -w @brewlite/backend` | Tạo lại Prisma Client khi cần |
| `npm run prisma:studio -w @brewlite/backend` | Xem database đang được `DATABASE_URL` trỏ tới |
| `npm run build` | Build NestJS rồi Next.js |

Các mẫu cấu hình còn lại có mục đích riêng: `.env.docker.example` cho Compose, `backend/.env.example` cho API local, `frontend/.env.example` cho web local. File cấu hình thật chứa secret không được commit.

## Database và kho nguyên liệu

### Cập nhật schema và dữ liệu mẫu

Áp dụng migrations bằng:

```powershell
npm run prisma:deploy -w @brewlite/backend
```

Migrations hiện có dữ liệu danh mục demo và công thức cho các điều kiện database tương ứng. Backend cũng thêm bốn sản phẩm mẫu nếu bảng Product trống. Database Render riêng không tự nhận dữ liệu từ PostgreSQL trên máy.

Hai seed có mục đích khác nhau:

| Lệnh | Phạm vi và tác động |
|---|---|
| `npm run prisma:seed -w @brewlite/backend` | Dựng lại dữ liệu demo, có `TRUNCATE`; chỉ dùng database thử nghiệm có thể xóa |
| `npm run prisma:seed:ingredients -w @brewlite/backend` | Thêm nguyên liệu/công thức mẫu còn thiếu, giữ tồn và công thức đã có; không tự nạp lại tồn về giá trị mẫu |

Cả hai seed bị chặn khi `NODE_ENV=production`. Không đổi mode để chạy seed trên database đang chứa giao dịch cần giữ. `prisma migrate reset`, `prisma db push --accept-data-loss` và test E2E cũng không dùng trên database vận hành.

### Kiểm tra thiếu công thức hoặc hết nguyên liệu

```http
GET /products/1/availability?size=S
```

| Kết quả | Ý nghĩa |
|---|---|
| `configured: false`, `maxCups: null`, `ingredients: []` | Chưa có công thức áp dụng; không đồng nghĩa mất kết nối database |
| `configured: true`, `maxCups: 0` | Có công thức nhưng ít nhất một nguyên liệu không đủ pha một ly |
| `configured: true`, `maxCups > 0` | Số ly ước tính theo lựa chọn hiện tại; khi đặt vẫn kiểm tra lại |

Migration `20261102210000_tv4_backfill_catalog_ingredients` bổ sung công thức cho danh mục demo có sẵn trên Render. Nó giữ nguyên đơn hàng, giao dịch, người dùng, tồn kho và công thức đã có. Nguyên liệu mới được tạo với **stock = 0**, vì chưa có số liệu kiểm kê. Sau migration, báo hết nguyên liệu có thể là kết quả đúng.

Trước khi mở nhận đơn, kiểm tra dữ liệu và nhập tồn theo số lượng thực tế, tăng `Ingredient.version` khi điều chỉnh tồn. Chạy lại seed nguyên liệu không thay đổi bản ghi có tồn bằng 0. Khi thử demo cần dùng database riêng và dữ liệu kho phù hợp.

SQL chỉ đọc để đối chiếu:

```sql
SELECT "code", "name", "unit", "stock", "version"
FROM "Ingredient" ORDER BY "code";

SELECT p."name", pi."size", pi."topping", i."code", pi."quantity"
FROM "ProductIngredient" pi
JOIN "Product" p ON p."id" = pi."productId"
JOIN "Ingredient" i ON i."id" = pi."ingredientId"
ORDER BY p."name", pi."size", pi."topping", i."code";
```

Kho dùng đơn vị gốc `G`, `ML`, `PIECE`; định lượng/tồn lưu bằng Decimal. Backend cộng nhu cầu nguyên liệu của toàn bộ đơn, trừ bằng điều kiện `version` và `stock >= requiredQty` trong transaction. `OrderIngredient` lưu lượng đã giữ để hoàn đúng khi hủy, kể cả công thức sau đó thay đổi. Thanh toán không trừ kho lần hai.

## Sao lưu và khôi phục database

Sao lưu trước khi cập nhật database có dữ liệu cần giữ. Không commit file backup vì có thể chứa tài khoản và thông tin giao dịch.

### PostgreSQL trong Docker Compose

Tạo backup bên trong container rồi copy ra máy; tránh chuyển file nhị phân qua toán tử `>` của Windows PowerShell:

```powershell
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/brewlite-backup.dump'
docker compose cp postgres:/tmp/brewlite-backup.dump ./brewlite-backup.dump
```

### PostgreSQL local hoặc Render

Dùng `pg_dump` cùng major version với server, hoặc bản mới hơn hỗ trợ server đó. Đặt URL đúng database cần sao lưu; với Render dùng thông tin kết nối được cấp và quyền truy cập mạng phù hợp:

```powershell
$env:BREWLITE_BACKUP_DATABASE_URL = "postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require"
pg_dump --dbname "$env:BREWLITE_BACKUP_DATABASE_URL" --format=custom --file=brewlite-backup.dump
pg_restore --list brewlite-backup.dump
Remove-Item Env:BREWLITE_BACKUP_DATABASE_URL
```

Thay các giá trị mẫu; URL của `pg_dump` không dùng tham số Prisma `schema=public`. Không đưa URL có mật khẩu vào Git hoặc ảnh chụp. Kiểm tra exit code, dung lượng file và thử phục hồi để xác nhận backup dùng được.

Khôi phục vào một **database mới, trống**, không trỏ nhầm database đang chạy:

```powershell
$env:BREWLITE_RESTORE_DATABASE_URL = "postgresql://USER:PASSWORD@HOST:5432/NEW_EMPTY_DATABASE?sslmode=require"
pg_restore --dbname "$env:BREWLITE_RESTORE_DATABASE_URL" --no-owner --no-acl --exit-on-error brewlite-backup.dump
Remove-Item Env:BREWLITE_RESTORE_DATABASE_URL
```

Tạo database đích trước; chỉ đổi ứng dụng sang database phục hồi sau khi kiểm tra dữ liệu. Blueprint hiện đặt `ipAllowList: []`; nếu bị chặn kết nối từ máy, dùng đường kết nối được phép hoặc cấp quyền IP phù hợp trong tài khoản Render.

## Thanh toán mock và payOS

### Mock

Backend `PAYMENT_MODE=mock`, frontend `NEXT_PUBLIC_PAYMENT_MODE=mock`.

- `MOCK_QR` và `MOCK_CARD` là mô phỏng, không thu tiền và không nhập số thẻ.
- `SUCCESS`: tạo Payment, ghi `PAID`, cộng điểm và ghi PaymentAttempt trong cùng transaction.
- `FAILURE`: ghi PaymentAttempt và `PAYMENT_FAILED`, giữ giỏ để thử lại.
- Chưa rõ kết quả vì mất mạng: gửi lại cùng payload và idempotency key. Lần thử mới sau thất bại đã xác định dùng key mới.
- Cùng key, cùng nội dung trả kết quả cũ; đổi nội dung với key cũ hoặc thanh toán mới cho đơn đã có Payment bị từ chối.

### payOS

Chỉ backend giữ `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`. Cấu hình:

| Backend | Giá trị |
|---|---|
| `PAYMENT_MODE` | `payos` |
| `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY` | Khóa của kênh payOS được chủ tài khoản cấp |
| `PAYOS_RETURN_BASE_URL` | URL HTTPS thực tế của frontend |
| `PAYOS_ORDER_CODE_PREFIX` | Mặc định `260000000`; giữ ổn định sau khi đã có checkout |
| `FRONTEND_URL` | Origin frontend, hoặc danh sách origin cách nhau bằng dấu phẩy |

Frontend dùng `NEXT_PUBLIC_PAYMENT_MODE=payos`, `NEXT_PUBLIC_API_URL` trỏ đúng backend. Rebuild frontend sau khi đổi biến `NEXT_PUBLIC_*`; không dùng các biến public để chứa secret.

1. Khách tạo đơn, rồi gọi `POST /payments/payos/create` kèm JWT và `orderId`.
2. Backend kiểm tra chủ đơn, hạn và trạng thái; lấy số tiền từ `Order.total`, tạo hoặc khôi phục link đã có.
3. Frontend chuyển đến URL HTTPS thuộc `pay.payos.vn`.
4. payOS gửi `POST <BACKEND_HTTPS>/payments/payos/webhook`. Đăng ký URL này trong kênh payOS. Mở URL bằng GET trên trình duyệt không kiểm tra được webhook POST.
5. Gateway kiểm tra HMAC-SHA256; service đối chiếu mã đơn, mã link, số tiền, giao dịch và trạng thái trước khi ghi Payment/PAID/điểm trong transaction.
6. Frontend hỏi trạng thái khoảng mỗi 5 giây. Backend có đối soát trực tiếp provider và khoảng nghỉ đồng bộ 10 giây để hỗ trợ webhook chậm.

Không dùng tham số URL redirect làm bằng chứng đã trả tiền. Khi provider timeout, giữ dữ liệu giao dịch để tra cứu; không tự kết luận thất bại hoặc yêu cầu chuyển tiền lại. Webhook lặp không cộng tiền/điểm lần nữa; mã chuyển khoản khác cho đơn đã trả cần đối soát. Khi bật payOS, API mock bị chặn bằng 403.

### Hết hạn và hủy đơn

- `ORDER_PAYMENT_TTL_MINUTES=15` mặc định; giá trị hợp lệ 2–1440 phút. Không tạo link mới khi còn dưới 120 giây. Giữ cấu hình TTL ổn định khi còn đơn chờ.
- `ORDER_EXPIRY_WORKER_ENABLED=false` mặc định. Đặt `true` trên tiến trình backend để quét mỗi 30 giây, tối đa 25 đơn/lượt. Compose hiện chưa truyền hai biến này từ `.env` vào backend; muốn đổi phải bổ sung vào `services.backend.environment`.
- Khi worker tắt, mở checkout payOS vẫn kích hoạt đồng bộ. Đơn có link chỉ được hết hạn và hoàn nguyên liệu sau khi provider xác nhận link hủy/hết hạn và chưa nhận tiền.
- Timeout hoặc thanh toán một phần cần giữ trạng thái/kho để đối soát. Hủy đơn đã có checkout payOS qua `/orders/:id/cancel` bị chặn; chưa có hoàn tiền tự động.

## Triển khai trên Render

Hai Docker Web Services dùng context là gốc repository, Dockerfile lần lượt `backend/Dockerfile`, `frontend/Dockerfile`; database dùng PostgreSQL. Backend tự chạy migrations khi khởi động.

`render.yaml` hiện khai báo nhánh `feature/tv01-payos-from-tv04`, `autoDeployTrigger: off` và thanh toán mock ở cả hai service. Nếu triển khai bản `main`, chọn đúng branch cho cả API và web; khi dùng Blueprint, cập nhật cả hai trường `branch` trong YAML trước khi Sync. Merge vào GitHub không đồng nghĩa Render đã deploy.

1. Kết nối repo `TuanEm2/Brewlite`; tạo Blueprint từ `render.yaml` hoặc cấu hình các service Docker tương ứng. Kiểm tra tài nguyên/gói dịch vụ trước khi tạo.
2. Backend nhận `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL` và cấu hình payment ở phía server. Với web/API khác domain, `FRONTEND_URL` phải khớp origin website để CORS hoạt động.
3. Lấy URL HTTPS thật của từng service. Đặt `NEXT_PUBLIC_API_URL` của web thành URL backend; nếu dùng payOS, đặt `PAYOS_RETURN_BASE_URL` thành URL frontend.
4. Deploy backend và **rebuild/deploy frontend** sau khi đổi cấu hình public. Sync Blueprint có thể áp lại các giá trị đang ghi trong YAML.
5. Kiểm tra `/api/health`, Menu, đăng nhập, tạo đơn, checkout và lịch sử. F12 → Network phải gọi đúng API HTTPS.
6. Kiểm tra nguyên liệu sau migration; nguyên liệu mới có stock 0 cần được nhập tồn phù hợp trước khi đặt hàng.

Ảnh được lưu tại `frontend/public/images/`: `ca-phe-sua.jpg`, `americano.jpg`, `cappuccino.jpg`, `tra-dao.jpg`. Kiểm tra `<FRONTEND_HTTPS>/images/cappuccino.jpg`; thêm/sửa ảnh phải commit file và redeploy web. Đường dẫn `/images/...` được phục vụ bởi frontend.

Trước khi nhận tiền thật, cần kênh payOS hợp lệ, webhook hoạt động, hạ tầng ổn định và quy trình sao lưu/đối soát/hoàn tiền. Không dùng kết quả thanh toán mock để chứng minh ngân hàng đã nhận tiền. Tham khảo [Render](https://render.com/docs) và [payOS](https://payos.vn/docs/api/) khi cấu hình dịch vụ.

## API

| Method | Endpoint | Xác thực | Công dụng |
|---|---|---|---|
| GET | `/api/health` | Không | Healthcheck |
| GET | `/products`, `/products/:id` | Không | Menu, chi tiết |
| GET | `/products/:id/availability?size=S` | Không | Công thức và số ly ước tính; topping dùng query `topping` lặp |
| POST | `/auth/register`, `/auth/login` | Không | Tạo tài khoản, lấy JWT |
| POST | `/orders` | JWT | Tạo đơn PENDING |
| GET | `/orders/me`, `/orders/:id` | JWT | Lịch sử/chi tiết đơn chính chủ |
| POST | `/orders/:id/cancel` | JWT | Hủy khi trạng thái và loại checkout cho phép |
| POST | `/payments`, `/payments/mock` | JWT | Thanh toán mock; bị chặn khi backend ở mode payOS |
| POST | `/payments/payos/create` | JWT | Nhận `orderId`, tạo/khôi phục link |
| GET | `/payments/payos/status/:id` | JWT | Đồng bộ và đọc trạng thái |
| POST | `/payments/payos/webhook` | HMAC | Nhận thông báo provider |

Các controller products/auth/orders/payments cũng có alias `/api/...`. API cần đăng nhập sử dụng header `Authorization: Bearer <JWT>`.

Ví dụ body tạo đơn; dùng UUID v4 mới cho yêu cầu mới, giữ nguyên khi retry cùng nội dung:

```json
{
  "items": [{ "productId": 3, "size": "L", "toppings": ["Kem"], "quantity": 1 }],
  "voucherCode": "BREW10",
  "idempotencyKey": "42534e1e-4c59-4736-b9f1-23ca1bb39e03"
}
```

Không gửi giá hoặc tổng tiền tự tính. DTO giới hạn 1–50 dòng, mỗi dòng 1–99 ly; backend kiểm tra size/topping thực tế của sản phẩm. Mã thường gặp: `400` dữ liệu sai, `401` JWT thiếu/hết hạn, `403` mock bị tắt, `404` không tìm thấy đơn của tài khoản, `409` xung đột kho/trạng thái/idempotency, `503` provider/cấu hình chưa sẵn sàng.

## Kiểm thử và demo

```powershell
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

- Unit test không cần database. E2E cần PostgreSQL riêng, `DATABASE_URL`, `JWT_SECRET` và schema đã migrate; test có tạo/xóa dữ liệu, không chạy trên database vận hành.
- CI tại `.github/workflows/ci.yml` chạy migrate, typecheck, unit, PostgreSQL E2E và build. Xem kết quả trên commit đang nộp, không lấy số test của tài liệu Sprint cũ làm kết quả hiện tại.
- `node scripts/check-api-latency.mjs` đo API đang chạy; đặt `API_URL` để đổi endpoint. Ghi lại kết quả đo thực tế và kiểm tra trình duyệt trước khi báo cáo.

Demo mock: Menu → chọn size/topping → thêm hai lần để kiểm tra gộp → F5 kiểm tra giỏ → tăng/giảm/xóa → đăng nhập → tạo PENDING → thử FAILURE → thử SUCCESS → xem lịch sử. Có thể nhập `BREW10` khi đủ điều kiện. Kiểm tra giữ/trừ/hoàn nguyên liệu trên database thử nghiệm.

Demo payOS: tạo đơn mới ở đúng mode, mở VietQR, kiểm tra webhook/đối soát và trạng thái từ backend. Đơn PAID bằng mock không dùng lại làm giao dịch thật. Với source hiện tại, nhánh xóa giỏ ở checkout thật chưa cộng voucher vào fingerprint so sánh; cần kiểm tra riêng trường hợp payOS kèm voucher. Trạng thái PAID và việc dọn giỏ là hai xử lý khác nhau.

## Đặc tả checkout

UC-CHECKOUT do TV3 phụ trách đặc tả; sơ đồ hiện có mô tả thanh toán mô phỏng. Đây là đặc tả nghiệp vụ của luồng, chưa thay thế mã FR/NFR chính thức trong SRS của nhóm.

- **Actor:** Khách hàng; dịch vụ thanh toán hỗ trợ.
- **Trigger:** Chọn Thanh toán tại giỏ.
- **Tiền điều kiện:** Giỏ có món hợp lệ; có dữ liệu sản phẩm/công thức; đăng nhập trước khi tạo đơn.
- **Luồng chính:** Xem/chỉnh giỏ → xác thực → gửi tạo đơn kèm khóa → backend kiểm tra, tính giá, giữ kho và tạo PENDING trong transaction → mở checkout → thanh toán → backend xác nhận → hiển thị mã đơn/số tiền → xem lịch sử.
- **Thành công:** Đơn thuộc đúng tài khoản, Payment ghi một lần, trạng thái PAID, tiền lấy từ backend; xử lý giỏ gắn với đơn và giữ món mới thêm sau khi tạo đơn.
- **Thay thế/ngoại lệ:** Chưa đăng nhập quay về auth và giữ giỏ; thiếu kho/voucher sai thì rollback; mock thất bại giữ giỏ; mất mạng chưa kết luận kết quả; retry đúng nội dung dùng lại khóa; đơn người khác không được trả dữ liệu; đơn đã trả tiền không tạo Payment mới.
- **Tiêu chí chấp nhận:** Tổng tiền/số lượng đúng; giỏ trống không đặt; kiểm tra JWT/owner; không cập nhật kho dở dang; thanh toán và retry không trùng; lịch sử riêng tài khoản; giao diện có loading/error/empty. Kiểm tra giao diện giả lập API không chứng minh transaction, kho hay phân quyền backend đã đạt.

Sơ đồ: [SVG](docs/diagrams/use-case-checkout.svg), [nguồn PlantUML](docs/diagrams/use-case-checkout.puml). Mapping FR/NFR → use case → code/API → test cần đối chiếu SRS chính thức khi nộp.

## Phân công và quy trình Git

| Thành viên | Phạm vi chính |
|---|---|
| TV1 | Monorepo/scripts; cart store; mock/idempotency; payOS backend; review/tích hợp |
| TV2 | Prisma/schema; cart/checkout UI; CSDL nguyên liệu; giao diện payOS |
| TV3 | Products API; Order model; state machine; timeout/đối soát; đặc tả checkout |
| TV4 | Menu; Orders HTTP API; optimistic locking/kho; integration và backfill công thức |
| TV5 | Detail; Auth; voucher/loyalty; kiểm thử bảo mật payOS |
| TV6 | Auth UI/tích hợp; lịch sử; Docker; smoke và acceptance |

Người phụ trách module và Git author có thể khác khi hỗ trợ sửa/push hộ; dùng lịch sử commit/PR để đối chiếu đóng góp. Lịch sử các nhánh kế thừa được giữ nguyên.

Mỗi thành viên làm trên `feature/tv01`…`feature/tv06` hoặc nhánh tác vụ từ bản nền đã thống nhất. Với quy trình kế thừa của nhóm: TV2 nhận TV1, TV3 nhận TV2, TV4 nhận TV3, TV5 nhận TV4, TV6 nhận TV5; TV1 nhận bản tích hợp trước Sprint tiếp theo. Fetch/merge bản nền vào nhánh riêng trước khi làm tiếp, giải quyết conflict và chạy lại kiểm tra.

Không push trực tiếp `main`; nhóm trưởng review và merge qua Pull Request. Giữ commit của người đóng góp, không sửa lịch sử người khác. Commit theo `feat(scope): ...`, `fix(scope): ...`, `test(scope): ...`, `docs(scope): ...`; thay dependency phải cập nhật lockfile. PR ghi phạm vi, cách kiểm thử, phụ thuộc và vấn đề còn lại. Không commit `.env`, secret, backup, `node_modules`, `.next`, `dist`.

Khi nghiệm thu Scrum, bổ sung Product/Sprint Backlog, ước lượng và ngày hoàn thành, Burndown, Planning/Daily/Review/Retrospective bằng dữ liệu thật. Bản nộp cần kết quả kiểm thử/build, demo Docker, kiểm tra API/giao diện và liên kết commit/PR tương ứng.
