# TV5 — kiểm thử bảo mật payOS, Assignment 1

## Bản nền và phạm vi

- Base: `feature/tv01-payos-from-tv04`, commit `1a19bc5d9d83cf23b3548696da245cd51db84f12`.
- Nhánh đề xuất: `feature/tv05-payos`.
- Không sửa nhánh Assignment 1 cũ `feature/tv05` hoặc Assignment 2 `feature/tv3-checkout`.
- Bổ sung `backend/src/payments/payos-security.spec.ts`. Không sửa production code, schema, dependency, dữ liệu hay cấu hình triển khai.

## 26 trường hợp kiểm thử

Hai alias `/payments` và `/api/payments` đều được kiểm tra: thiếu JWT, token không đúng định dạng, sai khóa ký, hết hạn; người khác không được tạo link/xem trạng thái đơn; client không được tự truyền amount; API mock trả 403 trong chế độ payOS.

Các tình huống còn lại: chủ đơn tạo link theo tổng sau BREW10 (70.000 xuống 63.000); query redirect không tự chuyển PAID; webhook thiếu/sai chữ ký hoặc sửa amount/orderCode; webhook được ký đúng nhưng sai amount/paymentLinkId hoặc thiếu reference; sự kiện thất bại; webhook hợp lệ không cần JWT khách; replay qua hai alias không ghi thanh toán/cộng điểm hai lần; reference mới trên đơn PAID bị chặn.

Kiểm tra từ HTTP qua controller, ValidationPipe, JwtAuthGuard/JwtService và PayosService thật. Giữ nguyên PayosGateway.verifyWebhook thật; ký fixture bằng khóa thử và phép chuẩn hóa độc lập cho fixture scalar. Chỉ mô phỏng các lời gọi provider outbound và Prisma. Chặn global fetch để test không gọi provider thật.

## Kết quả trên môi trường kiểm tra của trợ lý — 01/11/2026

- `npm ci`: thành công.
- Test mới: 26/26 đạt.
- `npm test -w @brewlite/backend`: 195/195 đạt, 16 suites.
- `npm run typecheck -w @brewlite/backend`: đạt.
- `npm run build -w @brewlite/backend`: đạt.
- Các dòng ERROR của PayosService trong ca sai amount/link/trạng thái là log dự kiến khi chủ động gửi dữ liệu bị từ chối; kết luận căn cứ tổng kết Jest và exit code.

Chưa xác nhận các kết quả này trên máy Windows của thành viên. Chưa chạy build frontend trong đợt bổ sung chỉ-test này.

## Giới hạn và phần nghiệm thu còn lại

Prisma là double trong bộ nhớ. Đây là HTTP/component integration, KHÔNG phải kiểm thử với PostgreSQL. Không chứng minh ràng buộc DB, row lock, rollback hoặc concurrency. Ca voucher dùng applyVoucher thật làm fixture nhưng chưa đi qua POST /orders thật. Replay trong bộ này là tuần tự.

Cần chạy thêm kiểm thử với PostgreSQL thử nghiệm riêng: fixture hai tài khoản, đơn có voucher, webhook chữ ký đúng/sai; đối chiếu Payment/PaymentAttempt/loyalty trước và sau yêu cầu bị từ chối; replay và xử lý đồng thời trên bản tích hợp cuối. Không dùng database Render hoặc merchant key thật cho các test này.

Không tuyên bố toàn bộ hệ thống bảo mật hoặc toàn bộ Assignment 1 đã nghiệm thu chỉ từ 26 test này. Nhóm trưởng còn cần tích hợp phần TV2/TV3/TV4/TV6 và kiểm thử bản cuối. Không tự deploy hoặc chuyển tiền thật.

## Chạy trên máy thành viên

Tại thư mục gốc repo:

```powershell
npm.cmd ci
npm.cmd test -w @brewlite/backend -- --runTestsByPath src/payments/payos-security.spec.ts
npm.cmd run typecheck -w @brewlite/backend
npm.cmd test -w @brewlite/backend
npm.cmd run build -w @brewlite/backend
```

Bộ test này không cần `.env`, PostgreSQL hay khóa payOS thật; các biến thử được thiết lập và khôi phục trong test.

Chỉ stage file test và tài liệu này. PR theo nhánh tích hợp nhóm trưởng đã chốt; chưa push thẳng main hay nhánh Render.

## Cập nhật kiểm chứng trên Windows — 01/11/2026

- Bộ test HTTP với Prisma mô phỏng: 26/26 đạt.
- Toàn bộ test backend: 195/195 đạt.
- Bộ PostgreSQL + HTTP: 11/11 đạt trên brewlite_tv5_payos_test.
- File mới: backend/test/payos-security.e2e-spec.ts.
- JWT thiếu/sai/hết hạn và truy cập đơn người khác bị từ chối.
- Webhook giả, sửa số tiền hoặc sai mã link bị từ chối; dữ liệu không đổi.
- Bốn webhook hợp lệ đồng thời chỉ tạo một Payment, một PaymentAttempt
  và cộng điểm một lần; gửi lại qua alias không thay đổi kết quả.
- Không gọi payOS thật, không sử dụng khóa merchant hoặc chuyển tiền thật.

Kết quả PostgreSQL này bổ sung cho giới hạn của bộ test mô phỏng ở trên.
Đơn có voucher được tạo trực tiếp làm dữ liệu thử; chưa kiểm chứng toàn bộ
luồng POST /orders, công thức nguyên liệu hoặc bản tích hợp cuối của nhóm.