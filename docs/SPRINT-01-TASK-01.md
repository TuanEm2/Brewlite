# Sprint 1 — Task 1: Khởi tạo dự án (TV1)

## User Story / Goal

Tạo monorepo với hai ứng dụng Next.js/NestJS chạy được, chuẩn bị nền tảng để TV2 thiết kế database và TV3 phát triển API sản phẩm.

## Acceptance Criteria (theo tài liệu BrewLite)

- [x] Có 2 thư mục `frontend/` (Next.js) và `backend/` (NestJS).
- [x] Cả hai ứng dụng có mã nguồn màn hình/endpoint "Hello".
- [x] Có README mô tả cách chạy.
- [x] Có `.env.example` và `.gitignore`.
- [ ] Code được cài đặt, chạy và kiểm thử thành công trên máy TV1.
- [ ] Đã commit/push nhánh `feature/tv01` và người kế tiếp xác nhận pull được.

## Kiểm tra thủ công (TV1 thực hiện trên máy thật)

1. Cài `npm install` từ root (tạo `package-lock.json`).
2. Copy `frontend/.env.example` → `frontend/.env.local` và `backend/.env.example` → `backend/.env`.
3. `npm run dev`, mở http://localhost:3000 nhìn thấy giao diện BrewLite.
4. Mở http://localhost:4000/api nhận chuỗi chào.
5. Mở http://localhost:4000/api/health nhận `status: ok`.
6. Trang frontend hiển thị trạng thái kết nối backend.
7. Chạy `npm run typecheck`, `npm run test`, `npm run build`.
8. Commit đủ các file nguồn và `package-lock.json`, không commit bí mật.

## Phạm vi ngoài Task 1

Không có PostgreSQL/Prisma, dữ liệu menu thật, API tạo đơn, JWT hoặc thanh toán. Các phần này do TV2–TV6 tiếp tục làm theo backlog.

## Bàn giao TV2

- Điểm bắt đầu: `feature/tv01` sau khi TV1 push.
- TV2 chuẩn bị Prisma/PostgreSQL, schema Product và seed mẫu.
- Bảo đảm môi trường của Task 1 còn hoạt động sau thay đổi.
