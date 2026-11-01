# TV2 — giao diện checkout payOS

Nhánh riêng: `feature/tv02-payos`, nền `origin/feature/tv01-payos-from-tv04`. TV1 merge sau khi các thành viên hoàn thành; không ghi đè nhánh người khác.

## Thay đổi

- Hoàn thiện màn checkout VietQR theo API TV1: mã đơn, số tiền, hướng dẫn chuyển sang payOS; các trạng thái chờ, thành công, thất bại, hủy, hết hạn và lỗi kết nối.
- Không thêm ảnh QR giả: API TV1 trả `checkoutUrl`, vì vậy khách bấm sang trang payOS để quét QR. Nếu cần QR ngay trong BrewLite, phải thống nhất bổ sung dữ liệu QR từ backend trước.
- Chỉ trạng thái Order đã thanh toán từ backend mới cho hiện xác nhận. Provider status PAID hoặc query redirect không đủ. PREPARING/READY/COMPLETED vẫn hiển thị đã thanh toán.
- Không có hai nút chọn kết quả trong giao diện payOS. UI mock cũ vẫn giữ sau cờ cấu hình của TV1; TV6 phải bật `NEXT_PUBLIC_PAYMENT_MODE=payos` khi build frontend và `PAYMENT_MODE=payos` ở backend.
- Kiểm tra lại thủ công và polling tuần tự mỗi 5 giây, không chồng request; dừng polling ở trạng thái kết thúc. GET có timeout 10 giây, tạo thanh toán 15 giây; request cũ bị hủy khi đổi đơn/tài khoản hoặc rời trang.
- Lỗi kết nối không bị coi là thất bại thanh toán. Hiển thị hướng dẫn giữ mã đơn, kiểm tra lại và tránh chuyển tiền lần nữa.
- Chặn bấm tạo link lặp trong cùng lượt; chỉ chuyển tới HTTPS `pay.payos.vn`, không chấp nhận URL có username/password hoặc cổng khác.
- Chỉ xóa giỏ sau trạng thái đã thanh toán khi đơn, tài khoản và fingerprint giỏ đều khớp session đã lưu. Không xóa giỏ đã được thay đổi sang đơn/món khác.
- Responsive, nút chạm tối thiểu 48px; trạng thái/lỗi có role status/alert.

## Phạm vi phối hợp

- TV3: hết hạn thực tế, timeout giao dịch và đồng bộ providerStatus. UI chỉ trình bày các trạng thái backend trả, không tự hết hạn, không cập nhật Order.
- TV4/TV5: concurrency, webhook và phân quyền theo bảng phân công.
- TV6: kiểm thử tổng hợp, cấu hình mode và môi trường công khai. Không đưa secret vào NEXT_PUBLIC hoặc commit .env.
- Không đổi schema, backend, webhook, Docker hoặc cấu hình Render trong phần TV2 này.

## Kiểm chứng

- `npm run typecheck`: frontend và backend đạt.
- `npm run test -w @brewlite/backend -- --cacheDirectory=<workspace-cache>`: 185/185 test, 16 suite; gồm 16 test mới cho trạng thái, dữ liệu sai đơn/sai số tiền và URL không hợp lệ.
- Backend build đạt.
- Build mặc định `npm run build` bị Turbopack panic khi tạo tiến trình xử lý CSS trên máy Windows này; thử lại ngoài môi trường hạn chế vẫn gặp. `npm run build -w @brewlite/frontend -- --webpack` đạt, đủ 8 trang. Chưa khẳng định build Turbopack/Docker/CI của nhóm đạt; không sửa script build thuộc phần cấu hình chung.
- Browser kiểm thử bằng bản sao nguồn UI cùng checksum, API giả localhost:4020 và frontend localhost:3002; không gọi payOS, không dùng merchant key hoặc tiền thật.
- Quan sát được: chờ, thất bại, hết hạn (ẩn nút chuyển tiền), HTTP 503 (không kết luận mất tiền), phục hồi sang PAID, URL ngoài payOS bị chặn. Không có nút tự chọn thành công/thất bại trong màn payOS.
- Responsive: viewport 390x844 (vùng nội dung 375px do scrollbar) và 1280x900 (nội dung 1265px), scrollWidth bằng clientWidth ở cả hai.
- Ảnh và JSON test lưu ngoài repository trong thư mục outputs của phiên làm việc. Màn PAID trong ảnh là dữ liệu giả, không chứng minh đã nhận tiền/webhook thật. Luồng chuyển tới payOS thật và webhook end-to-end chưa kiểm thử.

Tài liệu payOS xác nhận không có sandbox riêng: https://payos.vn/docs/moi-truong-test/ . Không coi môi trường merchant thật là giả lập.
