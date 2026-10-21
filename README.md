# BrewLite ☕ | Software Engineering — Sprint 1 / Task 1

BrewLite là dự án **ứng dụng đặt đồ uống, thanh toán không tiền mặt** của nhóm môn Công nghệ Phần mềm. Dự án sử dụng **Next.js (frontend)** và **NestJS (backend)** theo yêu cầu của đề bài. Đây là **bản khởi tạo TV1, Task 1**, không phải ứng dụng đặt hàng hoàn chỉnh.

## 1. Phạm vi bàn giao TV1

- [x] Monorepo một GitHub repository với hai thư mục `frontend/`, `backend/`.
- [x] Next.js + TypeScript + Tailwind CSS có trang chào và kiểm tra API.
- [x] NestJS + TypeScript có `GET /api` và `GET /api/health`.
- [x] `npm workspaces` để cài/thực thi cùng repo.
- [x] `.gitignore`, `.env.example`, README, CONTRIBUTING và ví dụ unit test.
- [ ] PostgreSQL, Prisma, schema Product (phân công TV2).
- [ ] API sản phẩm `/products` (TV3), menu, giỏ hàng, auth, payment... (những thành viên/Sprint sau).

## 2. Điều kiện chạy

Cài **Node.js 24.15+ (khuyến nghị)** hoặc **Node.js 22.22.3+**, và npm 10+. Kiểm tra:

```bash
node -v
npm -v
```

Cài Git và VS Code nếu chưa có. Đối với Task 1 **chưa cần cài PostgreSQL**.

## 3. Cài và chạy (Windows / PowerShell / VS Code Terminal)

Mở terminal tại thư mục gốc có file `package.json` của BrewLite, chạy:

```powershell
npm install
Copy-Item frontend/.env.example frontend/.env.local
Copy-Item backend/.env.example backend/.env
npm run dev
```

> Linux/macOS: thay hai lệnh `Copy-Item` bằng `cp`.
>
> `npm install` sẽ tạo **package-lock.json**. Hãy commit file này vào GitHub để những người sau cùng cài đúng dependency; **không commit `node_modules`**.

Mở:

- **Frontend:** http://localhost:3000
- **Backend hello:** http://localhost:4000/api
- **Backend health:** http://localhost:4000/api/health

Khi API khởi động, trang frontend sẽ tự kiểm tra backend và hiển thị "Đã kết nối". Không yêu cầu database ở Task 1.

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
```

**Ghi chú:** `npm run build` cần mạng tải dependency khi cài lần đầu. Do môi trường tạo gói không truy cập được npm registry, bạn cần chạy các lệnh trên máy của mình để xác nhận build thực tế trước khi push.

## 4. Cấu trúc dự án

```text
BrewLite/
├── .github/
│   └── pull_request_template.md
├── docs/
│   ├── SPRINT-01-TASK-01.md
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
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── app.controller.ts
│   │   ├── app.service.ts
│   │   └── app.controller.spec.ts
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

## 7. Giao việc tiếp theo cho TV2

- Thiết lập PostgreSQL + Prisma trong thư mục `backend/`.
- Thiết kế schema `Product`, bổ sung dữ liệu mẫu; thống nhất giá và stock với TV3.
- Duy trì endpoint `/api/health` và không làm hỏng `npm run dev`, `npm run test`.
- Không đưa mật khẩu hoặc chuỗi kết nối thực lên Git.
- Đọc `CONTRIBUTING.md` và `docs/GIT-WORKFLOW.md` trước khi push.

> **Lưu ý về API:** đề yêu cầu `GET /products`, `GET /products/:id` ở Task 2. Phần này được giao TV3 trong lịch nhóm; hai endpoint `/api` trong Task 1 chỉ là endpoint thử nghiệm. Cần thống nhất URL API thật với nhóm khi bắt đầu Task 2.
