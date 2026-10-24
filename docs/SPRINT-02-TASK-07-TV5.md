# Sprint 2 — Task 7: Auth backend — TV5

## Phạm vi đã thực hiện

- POST /auth/register: đăng ký tài khoản.
- POST /auth/login: đăng nhập, cấp JWT.
- Có alias /api/auth/register và /api/auth/login.
- Băm mật khẩu bằng bcrypt, cost 12.
- Email được trim và chuyển về chữ thường.
- JWT ký bằng HS256, thời hạn 1 giờ, sub chứa ID người dùng.
- Không trả mật khẩu hoặc passwordHash trong phản hồi API.

## Cấu hình và khởi chạy

Cài dependency tại thư mục gốc:

```powershell
npm.cmd ci
```

Nếu chưa có cấu hình cá nhân, sao chép:
- backend/.env.example thành backend/.env.
- frontend/.env.example thành frontend/.env.local.

Điền DATABASE_URL và tạo khóa JWT riêng:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Điền chuỗi vừa tạo vào JWT_SECRET trong backend/.env.
Không commit hoặc gửi kèm file cấu hình chứa bí mật.

Áp dụng migration có sẵn:

```powershell
npm.cmd run prisma:deploy -w @brewlite/backend
```

Không tự động chạy seed trên database có dữ liệu cần giữ:
seed hiện xóa dữ liệu sản phẩm, đơn hàng và thanh toán.

Khởi động:

```powershell
npm.cmd run dev
```

## Hợp đồng API

### POST /auth/register

Body:

```json
{
  "email": "customer@example.com",
  "password": "BrewLite@123"
}
```

- 201: trả id, email, createdAt; không cấp token.
- 409: email đã được đăng ký.
- 400: dữ liệu không hợp lệ hoặc có trường thừa.

Mật khẩu đăng ký ít nhất 8 ký tự và tối đa 72 byte.
Không trim hoặc đổi chữ hoa/thường của mật khẩu.

### POST /auth/login

Body gồm email và password như trên.

Thành công 200:

```json
{
  "access_token": "<JWT>",
  "token_type": "Bearer",
  "user": {
    "id": 1,
    "email": "customer@example.com"
  }
}
```

- 401: email không tồn tại hoặc mật khẩu sai.
- 400: dữ liệu đầu vào không hợp lệ.

## Những file TV5 thêm hoặc sửa

Thêm:
- backend/src/auth/dto/auth.dto.ts
- backend/src/auth/auth.service.ts
- backend/src/auth/auth.controller.ts
- backend/src/auth/auth.module.ts
- backend/src/auth/auth.service.spec.ts
- backend/test/auth.e2e-spec.ts
- docs/SPRINT-02-TASK-07-TV5.md

Sửa:
- backend/src/app.module.ts: đăng ký AuthModule.
- backend/package.json: thêm thư viện JWT và bcrypt.
- package-lock.json: ghi nhận dependency.

Bổ sung lại trong bản làm việc từ ZIP:
- backend/.env.example
- frontend/.env.example

Khi tích hợp Git, đối chiếu các file mẫu với bản TV4 đã push,
giữ những cấu hình có sẵn còn cần thiết.

## Kiểm thử đã chạy trên máy TV5

- Typecheck frontend/backend: đạt.
- Unit test toàn dự án: 50/50 đạt.
- E2E/integration toàn dự án: 30/30 đạt.
- Build backend/frontend: đạt, exit code 0.

Test riêng phần Auth:
- 5 unit test AuthService.
- 7 test HTTP/integration Auth.
- Kiểm tra JWT có chữ ký hợp lệ, sub đúng và hạn 1 giờ.

Kiểm thử thủ công:
- Đăng ký thành công: 201.
- Email trùng: 409.
- Đăng nhập đúng: 200, có token.
- Mật khẩu sai: 401.
- Email sai, mật khẩu ngắn, thiếu mật khẩu,
  tự gửi loyaltyPoints: đều trả 400.

## TV6 cần tích hợp

Theo phân công, TV6 thực hiện:
- UI đăng ký và đăng nhập.
- Gửi token theo header Authorization: Bearer <token>.
- Thêm guard xác thực JWT cho API tạo đơn.
- Kiểm tra chữ ký và hạn token, không chỉ decode token.
- Lấy ID người dùng từ JWT đã xác thực để tạo đơn.
- Thay createPending(null, dto) bằng ID người dùng đã xác thực.
- Không lấy userId do client tự gửi trong body.
- Bảo vệ cả /orders và /api/orders.
- Kiểm thử thiếu token, token sai, token hết hạn và token hợp lệ.
- Kiểm thử luồng Cart → Auth → Order.

AuthModule đã export JwtModule để hỗ trợ tích hợp.

Lưu ý: hiện POST /orders vẫn chưa có guard.
Chưa xác nhận hoàn thành toàn bộ Sprint 2.

## Lưu ý về bản bàn giao

TV5 phát triển trên bản ZIP nhận từ TV4 theo thống nhất của nhóm.
Bản ZIP không thay thế lịch sử Git.

Trước khi push feature/tv05:
- Nhận bản Sprint 2 của TV4 qua Git.
- Đối chiếu khác biệt với ZIP nền.
- Tích hợp phần TV5, giữ lịch sử và tác giả của thành viên trước.
- Chạy lại các kiểm tra trên bản tích hợp.
- Ghi commit thật; không sửa timestamp.

Npm có báo 6 lỗ hổng mức high lúc cài dependency.
Chưa phân tích hoặc khắc phục; không coi build/test đạt
là bằng chứng đã xử lý các cảnh báo bảo mật này.
## Cập nhật tích hợp Git — 24/10/2026

- Đã nhận lịch sử TV4 tại commit 152bf67 bằng fast-forward.
- Bổ sung ValidationPipe trong backend/src/main.ts vì bản Git
  kế thừa chưa bật validation toàn cục.
- Đã tích hợp Auth vào repository Brewlite-TV5.
- Kiểm thử lại trên bản Git: typecheck đạt, 50 unit test đạt,
  30 E2E/integration test đạt, build thành công với exit code 0.
- POST /orders và /api/orders vẫn cần TV6 tích hợp JWT guard.
- Cấu hình mẫu kế thừa được giữ lại; bổ sung JWT_SECRET
  trong backend/.env.example.