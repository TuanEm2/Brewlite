# Assignment 2 — Bàn giao TV3

## 1. Phạm vi và bản nền

- Nhánh: feature/tv3-checkout.
- Bản nền: 20bcecf trên main, kế thừa Assignment 1.
- Phụ trách: đặc tả checkout, use-case diagram, frontend giỏ hàng,
  checkout và lịch sử đơn; kiểm thử giao diện liên quan.

## 2. Chức năng kế thừa

Bản nền đã có:
- Giỏ hàng, thay đổi số lượng, xóa món và tổng tiền.
- Checkout, thanh toán Ví/Thẻ mô phỏng, xác nhận đơn.
- Lịch sử/chi tiết đơn và thao tác hủy đơn.
- API xác thực, đơn hàng, thanh toán, voucher và loyalty.

TV3 không nhận các chức năng kế thừa này là phần viết mới
trong Assignment 2.

## 3. Đóng góp mới

### Đặc tả và sơ đồ

- docs/requirements/use-case-checkout.md.
- docs/diagrams/use-case-checkout.puml.
- docs/diagrams/use-case-checkout.svg.

Đặc tả gồm luồng chính, thay thế, ngoại lệ và tiêu chí chấp nhận.
Hiện là bản nháp, chờ đối chiếu mã FR/NFR với SRS của TV2.

### Sửa checkout

File: frontend/app/checkout/[id]/page.tsx.

Lỗi đã tái hiện bằng test:
- Tạo đơn từ giỏ A, sau đó thêm món B.
- Mở đơn cũ đã PAID khiến toàn bộ giỏ bị xóa, gồm món B.

Hành vi sau sửa:
- Chỉ xóa toàn bộ giỏ khi đúng tài khoản, đúng đơn và fingerprint
  giỏ hiện tại khớp dữ liệu dùng lúc tạo đơn, có xét voucher.
- Nếu giỏ thay đổi, giữ nguyên toàn bộ giỏ.
- Xóa liên kết đơn chờ tương ứng khi đơn đã PAID.

Giới hạn:
- Chưa tự trừ riêng các món đã mua khỏi giỏ đã thay đổi.
- Giỏ được giữ có thể vẫn chứa món thuộc đơn đã thanh toán.

### Kiểm thử frontend

Thiết lập Jest, jsdom và React Testing Library.

17 test trong 5 file:
- cart.test.tsx: 3 test.
- checkout.test.tsx: 7 test.
- orders.test.tsx: 5 test.
- cart-inventory.test.tsx: 1 test.
- cart-create-order.test.tsx: 1 test.

Phạm vi:
- Giỏ trống, tăng/giảm số lượng, xóa món.
- Chuyển đăng nhập khi chưa có token.
- Giữ món mới và xóa giỏ không thay đổi sau PAID.
- Voucher và dữ liệu đơn chờ thuộc tài khoản khác.
- Bấm thanh toán và hiển thị xác nhận.
- Mất mạng rồi gửi lại cùng khóa thanh toán.
- Thanh toán thất bại giữ giỏ, hiển thị nút thử lại.
- Lịch sử trống, hiển thị đơn, lỗi 401/500.

API được giả lập trong các test giao diện.
Các test này không thay thế kiểm thử phân quyền backend
hoặc E2E qua trình duyệt với API/database thật.

### Lệnh test chung

npm test tại thư mục gốc chạy lần lượt:
1. Backend.
2. Frontend, nếu backend đạt.

Workflow CI kế thừa đang gọi npm test nên sẽ chạy thêm
test frontend khi tích hợp thay đổi này.
Chưa xác nhận kết quả CI trên GitHub cho nhánh Assignment 2.

## 4. Minh chứng đã có

- Test tái hiện lỗi mất món mới từng thất bại đúng assertion
  trước khi sửa checkout.
- npm test: backend 164/164, frontend 15/15 đạt trên máy phát triển.
- npm run typecheck: frontend và backend không báo lỗi
  sau khi bổ sung đủ 15 test.
- npm run build: build backend và frontend thành công trên bản
  af16ae8, gồm đủ 15 test frontend; exit code 0.
- Chưa chạy lại PostgreSQL integration/E2E cho nhánh Assignment 2.
- Chưa xác nhận CI, production hoặc nghiệm thu toàn bộ Assignment 2.

## 5. Commit đóng góp

- 60139fe: bản nháp đặc tả checkout và sơ đồ use-case.
- 73de68b: sửa bảo vệ giỏ sau thanh toán, cấu hình và test UI.
- e599834: bổ sung test giỏ, lỗi thanh toán và lịch sử.
- af16ae8: chạy test frontend/backend từ thư mục gốc.

## 6. Cách kiểm tra

Chạy từng lệnh tại thư mục gốc:

    npm ci
    npm run typecheck
    npm test
    npm run build

Kiểm thử PostgreSQL integration/E2E cần database thử nghiệm,
biến môi trường hợp lệ và migrations tương ứng:

    npm run test:e2e

Không dùng database production để chạy test.

## 7. Những việc cần phối hợp trước nghiệm thu

- TV2: cung cấp SRS, thống nhất mã FR/NFR và phạm vi voucher/loyalty.
- TV3: cập nhật liên kết yêu cầu và cung cấp mapping test cho TV2.
- TV5/TV6: xác nhận API contract và phối hợp kiểm thử tích hợp.
- TV6: E2E qua trình duyệt từ menu đến xác nhận đơn.
- TV1: review PR, chuẩn hóa apps/web và apps/api, lint/CI/CD,
  branch protection và triển khai theo phân công.
- Khi đổi cấu trúc thư mục, cập nhật các đường dẫn và cấu hình test.
- Chạy kiểm tra cuối trên bản tích hợp và lưu minh chứng thực tế.

Báo cáo này không xác nhận các Task 1–5 của cả nhóm đã hoàn tất.

## 8. Bổ sung kiểm thử ngày 30/10/2026

- Thêm cart-inventory.test.tsx: giả lập POST /orders trả HTTP 409
  vì thiếu nguyên liệu.
- Xác nhận giao diện hiển thị thông báo lỗi, giữ nguyên giỏ,
  không chuyển sang checkout, không lưu đơn chờ mới
  và cho phép thao tác thanh toán lại.
- npm.cmd test -w @brewlite/frontend: 4 suites, 16 tests PASS.
- npm.cmd run typecheck -w @brewlite/frontend: không báo lỗi.
- Đây là test giao diện với API giả lập; chưa xác nhận nghiệp vụ
  kho nguyên liệu bằng backend/database thật.
- Chưa tích hợp nhánh TV4 vào nhánh TV3.

### Bổ sung luồng tạo đơn thành công

- cart-create-order.test.tsx kiểm tra frontend gửi đúng lựa chọn,
  số lượng, JWT và idempotency key.
- Khi API giả lập trả đơn PENDING, giao diện chuyển tới checkout
  theo ID nhận được, lưu liên kết đơn chờ và giữ nguyên giỏ.
- Không gửi giá do frontend tự quyết định trong payload tạo đơn.
- Kết quả kiểm tra chung: 5 suites, 17 tests frontend PASS;
  frontend typecheck không báo lỗi.
- Chưa xác nhận tạo đơn và trừ kho với backend/database thật.