# Hướng dẫn đóng góp — BrewLite

## Tổ chức code

- Một repo chung `BrewLite` và các nhánh `feature/tv01` ... `feature/tv06`.
- Không push trực tiếp `main`. Chỉ nhóm trưởng duyệt và merge `main` cuối đồ án.
- Mỗi người có tài khoản GitHub và email Git gắn với tài khoản đó.
- Ưu tiên commit nhỏ, có chức năng thực tế, không tạo commit giả chỉ để tăng số lượng đóng góp.
- Không commit `.env`, khóa bí mật, `node_modules/`, `.next/`, `dist/`.
- Khi thêm/sửa dependency, commit cả `package.json` và `package-lock.json`.

## Quy ước thư mục

- `frontend/app`: giao diện Next.js (App Router).
- `backend/src`: API, module, service NestJS.
- `docs/`: quyết định thiết kế, Scrum, và hướng dẫn bàn giao.
- TV2 nên đặt Prisma schema và migration trong `backend/prisma/`.

## Trước khi push

```bash
npm run typecheck
npm run test
npm run build
```

Chạy thử hai URL frontend, backend; thử ít nhất một luồng liên quan tới công việc được giao.

## Commit và bàn giao

Dùng mẫu `type(scope): nội dung`, ví dụ:

- `feat(task-01): initialize frontend and backend`
- `feat(products): add PostgreSQL product model`
- `fix(cart): keep topping when updating quantity`
- `test(orders): reject invalid state transition`

Để dễ nhận diện đóng góp, mỗi lần bàn giao ghi trong nhóm: thành viên, task, branch, mã commit, URL API/trang liên quan, các test đã chạy, lỗi còn lại và tên người nhận tiếp.

## Nguyên tắc kế thừa giữa các nhánh

Xem `docs/GIT-WORKFLOW.md`. Người kế tiếp phải đồng bộ nhánh mới nhất của người trước khi làm, và không tự ý thay đổi lịch sử của người khác.
