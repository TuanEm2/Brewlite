# Minh chứng Scrum — checklist trước khi nộp BrewLite

Tài liệu này **chỉ là mẫu**; phải điền thông tin, số liệu và ngày họp THỰC TẾ của nhóm, không dùng dữ liệu giả.

## Product Backlog (tham chiếu đề BrewLite Ver 1.0)

| Task | Sprint | Owner | Trạng thái nghiệm thu | Minh chứng |
|---|---|---|---|---|
| 1–4 | 1 | TV1–TV6 | Chờ xác nhận | Commit, giao diện Menu, API products |
| 5–7 | 2 | TV1–TV6 | Chờ xác nhận | Commit, Cart, Order, Auth |
| 8–10 | 3 | TV1–TV6 | Chờ xác nhận | Payment, History, Task 10, Docker, test |

## Sprint Backlog

Mỗi Sprint bổ sung bảng: Task, Người phụ trách, Ước lượng, Ngày bắt đầu, Ngày hoàn tất thực tế, Blocker, Link commit/PR, Trạng thái kiểm thử.

## Burndown Chart

Ghi story points **còn lại thực tế** sau mỗi ngày. Dùng dữ liệu này tạo hai đường Ideal và Actual; không tự điền đường Actual bằng cách suy đoán.

| Ngày | Sprint | Story points dự kiến còn | Story points thực tế còn | Ghi chú |
|---|---|---:|---:|---|
| [điền] | [điền] | [điền] | [điền] | [điền] |

## Scrum events

- **Sprint Planning**: thời gian, người tham dự, mục tiêu và backlog chốt.
- **Daily Scrum**: từng ngày, đã làm / sẽ làm / vướng mắc (15 phút).
- **Sprint Review**: demo Increment, điều kiện chấp nhận, phản hồi giảng viên/PO.
- **Sprint Retrospective**: những việc làm tốt, việc cần cải thiện, hành động cho Sprint sau.

## Checklist Definition of Done

- [ ] `npm ci`, `npm run typecheck`, `npm run test`, `npm run test:e2e`, `npm run build` đều thành công trên bản nộp.
- [ ] `docker compose up --build -d` chạy đủ 3 dịch vụ, demo được Menu → Checkout → History.
- [ ] Có commit đúng người, nhóm trưởng review PR và merge lên `main`.
- [ ] API validate, giao diện có loading/empty/error, README đúng phiên bản.
- [ ] Đo API dưới 500ms trên máy demo, kiểm tra giao diện trình duyệt.
- [ ] Có Product/Sprint Backlog, Burndown, Review, Retrospective dùng dữ liệu thật.
- [ ] Ghi nhận phản hồi và các backlog chưa làm cho phiên bản sau.
