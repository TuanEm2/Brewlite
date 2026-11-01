# TV5: tương thích kiểm thử với TV3 payOS follow-up

## Phạm vi
Bản sửa chỉ thay đổi hai file test TV5. Không thay production service, giao diện, schema hoặc migration.
Nền TV5: fc57838. Nền kiểm chứng tích hợp TV3: b3a5e2a.

## Nguyên nhân và sửa đổi
- TV3 thêm OrdersService vào PayosService; đăng ký OrdersService và ProductsService thật trong cả hai testing module. PrismaService tiếp tục dùng fixture memory ở bộ HTTP và PrismaClient thật ở E2E.
- TV3 đọc createdAt, items và dùng findUnique/findFirstOrThrow khi đồng bộ. Bổ sung fixture/method double phù hợp.
- Chỉ giả lập phản hồi outbound getPaymentLink PENDING; giữ nguyên xác minh chữ ký webhook thật. fetch vẫn bị chặn.
- Tạo app mới cho mỗi HTTP test để cache đồng bộ của PayosService không rò sang test khác.
- TV1 trả 409 khi reference đổi; TV3 dùng paymentLinkId để chống trùng và trả 200. Test chọn kỳ vọng theo khả năng syncOrder của service đang chạy; ở cả hai phiên bản vẫn bắt buộc chỉ có một payment, một attempt và một lần cộng điểm. Đây là cầu nối cho hai nhánh; sau khi thống nhất nền tích hợp có thể cố định kỳ vọng 200.
- Giữ kiểm tra database riêng và ngoại lệ database GitHub Actions từ fc57838.

## Kiểm chứng đã chạy
- TV5: 26/26 test bảo mật HTTP đạt.
- TV3 + hai test file TV5 đã sửa: 26/26 test bảo mật HTTP đạt; toàn bộ backend 213/213 test, 17 suites đạt; backend typecheck đạt.
- Chưa chạy lại 11 E2E PostgreSQL của bản sửa trong môi trường kiểm chứng này vì không có PostgreSQL. Kết quả 11/11 trước đây không thay thế lần kiểm chứng sau sửa; cần chạy lại trên database test và CI sau tích hợp.
- Không xác nhận đã giải quyết test TV4, xung đột UI TV2–TV3 hoặc thanh toán live.

## Chạy lại trên máy phát triển
Sử dụng database local brewlite_tv5_payos_test và JWT test hợp lệ trong cùng phiên PowerShell; không dùng database demo/production.

```powershell
npm.cmd test -w @brewlite/backend
npm.cmd run typecheck -w @brewlite/backend
npm.cmd run test:e2e -w @brewlite/backend -- --runTestsByPath test/payos-security.e2e-spec.ts
```

Sau khi nhóm trưởng tích hợp TV3, generate Prisma Client và áp dụng migrations trên database test theo schema tích hợp rồi chạy lại các lệnh trên. Không reset database cần giữ.
