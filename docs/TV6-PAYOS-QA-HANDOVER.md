# TV6 — kiểm thử nghiệm thu payOS (bộ kiểm thử nhóm trưởng chuẩn bị)

## Phạm vi
File: `backend/test/payos-journey.e2e-spec.ts`. Chỉ chạy với PostgreSQL thử nghiệm riêng tại localhost (`brewlite_tv06_payos_test`) hoặc `brewlite_test` trên GitHub Actions. Chặn HTTP ra payOS; toàn bộ dữ liệu tài khoản, đơn, nguyên liệu, sản phẩm và chữ ký webhook là fixture test.

| Test case | Kịch bản | Kỳ vọng |
|---|---|---|
| TV6-01 | Tạo đơn → payOS checkout (mock outbound) → webhook signed → status/history | PAID, 1 Payment + 1 Attempt, điểm +3 |
| TV6-02 | Sửa amount, sai chữ ký hoặc webhook thất bại | Không PAID; webhook hợp lệ sau đó mới PAID |
| TV6-03 | 4 webhook đồng thời + replay qua alias API | Không tạo payment/điểm trùng |
| TV6-04 | Provider timeout rồi webhook thành công | Không kết luận thanh toán thất bại khi mất kết nối |
| TV6-05 | Thiếu JWT, xem đơn người khác, client sửa amount | 401 / 404 / 400 |
| TV6-06 | Provider từ chối kết nối tạo link | 503; không ghi PAID |

## Chạy kiểm tra
```powershell
# Sử dụng DATABASE_URL đến PostgreSQL TEST riêng, KHÔNG dùng Render
npm ci
npm run prisma:deploy -w @brewlite/backend
npm run test:e2e -w @brewlite/backend -- --runTestsByPath test/payos-journey.e2e-spec.ts
npm run typecheck
npm run test
npm run build
```

## TV6 cần tự nghiệm thu
- [ ] Chạy E2E, lưu output CI/terminal và ghi số Pass/Fail thực tế.
- [ ] Kiểm tra giao diện trên mobile và desktop (Menu → Cart → Checkout → History).
- [ ] Chụp minh chứng trạng thái PENDING/PAID, che token và thông tin ngân hàng.
- [ ] Ghi rõ commit và ngày giờ chạy. Không ghi “đã nghiệm thu” khi chưa thực sự chạy.
- [ ] Đối chiếu sau khi TV3–TV5 được merge vào nhánh tích hợp; CI nhánh riêng không chứng minh bản hợp nhất đã chạy tốt.

## Kết quả thực tế
Chưa điền; sẽ cập nhật dựa trên CI và lần chạy của thành viên. Không chuyển tiền thật, không dùng Merchant API Key.
