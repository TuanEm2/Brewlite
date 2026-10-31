# BrewLite — Bàn giao sau tích hợp payOS (31/10/2026)

## 1. Bản gốc để cả nhóm tiếp tục

- Repo: `TuanEm2/Brewlite`
- Nhánh payOS đã push và đang dùng để deploy Render: `feature/tv01-payos-from-tv04`
- Commit gốc đã chạy CI thành công: `1a19bc5d9d83cf23b3548696da245cd51db84f12`
- Pull Request TV1: #4, `feature/tv01-payos-from-tv04` → `feature/tv04`, **chưa merge**.
- Nhánh bàn giao/nhận Pull Request tiếp theo: `integration/payos-team-handoff` (tách từ commit trên, chỉ bổ sung tài liệu này).
- Frontend demo: https://brewlite-tv1-web.onrender.com
- Backend demo: https://brewlite-tv1-api.onrender.com
- Ngày 31/10/2026, TV1 xác nhận qua hội thoại đã đăng ký webhook payOS, tạo link VietQR và thực hiện **một giao dịch thật** rồi đơn hiển thị thanh toán thành công. Đây là kết quả báo cáo thủ công của TV1, không thay thế đối soát ngân hàng hay E2E tự động.
- GitHub Actions tại commit `1a19bc5d`: completed/success.

**Quan trọng:** Không push trực tiếp vào nhánh Render đang deploy, không đưa Client ID, API Key, Checksum Key, `.env` lên GitHub. Không tự ý thay đổi cấu hình, trigger deploy, hoặc Sync Blueprint. `render.yaml` hiện định nghĩa cả hai PAYMENT_MODE/NEXT_PUBLIC_PAYMENT_MODE = `mock`; Render Environment đã được TV1 cấu hình khi demo, cần kiểm tra trước mọi lần deploy/sync.

## 2. Người làm tiếp: TV2, sau đó các TV làm song song

Phân công dưới đây là **đợt hoàn thiện sau Sprint 3**, không phải khẳng định những hạng mục Sprint 3 trước đây chưa làm. Sprint 3 đã có tài liệu hoàn thành của TV2–TV6.

| Thứ tự | Thành viên | Phần việc mới/kiểm tra | Kết quả cần bàn giao |
|---|---|---|---|
| 1 | **TV2** | **Hình ảnh sản phẩm và giao diện Menu/Chi tiết.** Repo hiện chỉ có `frontend/public/favicon.svg`, chưa có 4 ảnh JPG mà migration `20261031000002_product_local_images` trỏ đến. Bổ sung `frontend/public/images/ca-phe-sua.jpg`, `americano.jpg`, `cappuccino.jpg`, `tra-dao.jpg` từ nguồn ảnh hợp lệ; xác minh ảnh đúng ở Menu và trang chi tiết, thêm fallback nếu ảnh lỗi, kiểm tra responsive. | Ảnh hiển thị ở website; không còn ảnh vỡ. Ảnh có quyền sử dụng. Không sửa thanh toán. |
| 2 | **TV3** | Kiểm thử Order State Machine với luồng payOS thật: `PENDING → PAID → PREPARING → READY → COMPLETED`, chặn chuyển trạng thái sai; xác minh không có API cho người dùng tự gán `PAID`. Nếu triển khai route nhân viên thì phải có phân quyền rõ, không mở public route đổi trạng thái. | Test và bằng chứng chuyển trạng thái đúng, không làm suy yếu quyền truy cập. |
| 3 | **TV4** | Kiểm thử tồn nguyên liệu `Ingredient`/`OrderIngredient` trên nhánh tích hợp payOS: tạo đơn giữ/trừ kho đúng 1 lần, payOS `PAID` không trừ thêm, hết nguyên liệu không đặt được, tranh chấp đồng thời không bán quá tồn. Chưa thêm hoàn kho/hủy đơn có tiền thật nếu chưa có quy trình hoàn tiền + đối soát. | Test tồn kho, màn hình/số liệu trước–sau trên DB thử nghiệm, không reset DB Render. |
| 4 | **TV5** | Rà soát Voucher `BREW10`, tổng tiền trả qua payOS sau giảm, Loyalty chỉ cộng điểm đúng một lần khi webhook hợp lệ; webhook lặp không cộng trùng. Kiểm tra các trường hợp thanh toán không rõ kết quả; không tự cho phép hoàn tiền/hủy đơn PAID bằng mock. | Test voucher/loyalty và báo cáo chênh lệch (nếu có). |
| 5 | **TV6** | QA + tài liệu nghiệm thu: kiểm tra Menu → Cart → Auth → Order → VietQR → Webhook → History; đối chiếu trạng thái trong DB bằng giao dịch đã có, không cần chuyển tiền lặp lại. Cập nhật README hiện còn mô tả **chỉ thanh toán giả lập**, sửa slide/kịch bản demo, Scrum artifacts; chụp ảnh/video minh chứng có che thông tin ngân hàng và API keys. | README, test report, video demo, checklist nghiệm thu. |
| Cuối | **TV1 (trưởng nhóm)** | Review PR của TV2–TV6, xử lý conflict, chạy test/build/e2e **trên DB thử nghiệm**, hợp nhất vào nhánh tích hợp; kiểm soát một lần deploy có mục đích. | Bản tích hợp kiểm thử xanh, Render demo không bị tác động bất ngờ. |

## 3. Cách thành viên nhận code (PowerShell)

Tại thư mục BrewLite đã clone, bảo đảm thay đổi hiện tại đã commit hoặc stash:

```powershell
git fetch origin
git switch -c feature/tv02-payos-followup origin/integration/payos-team-handoff
npm ci
npm run typecheck
npm run test
npm run build
```

TV3/TV4/TV5/TV6 thay tên nhánh `feature/tv02-payos-followup` tương ứng với người làm, **tạo nhánh riêng từ cùng base**, không dùng lại nhánh `feature/tv02` / `feature/tv03` cũ vì chúng đã chứa lịch sử Sprint trước.

Khi xong:

```powershell
git status
git add <cac-file-minh-thay-doi>
git commit -m "feat(tv02): add product images and menu polish"
git push -u origin feature/tv02-payos-followup
```

Tạo Pull Request: `feature/tv02-payos-followup` → `integration/payos-team-handoff`. Không PR thẳng vào `main` hoặc nhánh Render đang hoạt động. TV1 review lần lượt.

## 4. Kiểm thử an toàn và lưu ý Git

- Chạy `npm run typecheck`, `npm run test`, `npm run build`. Chạy `npm run test:e2e` **chỉ với PostgreSQL thử nghiệm riêng**, vì test có thể tạo/xóa dữ liệu.
- Tuyệt đối không chạy `prisma db seed`, `migrate reset`, `docker compose down -v` hoặc test e2e trên Render DB đang chứa giao dịch thật.
- Thanh toán đã thử thật một lần; ưu tiên test mock/unit và kiểm tra DB/logs trước khi quyết định test lại giao dịch thật theo quyền của chủ tài khoản.
- `main` và nhánh payOS hiện **không có chung lịch sử commit** khi dùng GitHub compare; vì vậy đừng tự merge trực tiếp/force-push. TV1 cần quyết định cách hòa nhập lịch sử trước khi cập nhật `main`.
- Render Free có thể ngủ và không đáng tin cậy cho webhook tiền thật liên tục; bản demo phải đối soát thủ công khi cần. Chưa có xử lý hoàn tiền thực.
