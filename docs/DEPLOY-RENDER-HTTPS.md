# Bước 5 — đưa BrewLite lên HTTPS công khai (Render)

> Source: `feature/tv01-payos-from-tv04`. File `render.yaml` cùng nhánh này chỉ chuẩn bị môi trường preview: PAYMENT_MODE=mock. KHÔNG tự bật thanh toán thật.

## Trạng thái hiện tại

- Đã có `render.yaml` mô tả 3 tài nguyên: `brewlite-tv1-api` (NestJS), `brewlite-tv1-web` (Next.js) và `brewlite-tv1-db` (PostgreSQL).
- Chưa có domain hay dịch vụ nào được tạo trong tài khoản Render của người dùng; cần người sở hữu tài khoản đăng nhập Render và xác nhận tạo tài nguyên.
- Render tự cung cấp HTTPS cho hai Web Services trên domain `*.onrender.com`; không cần mua tên miền ngay.
- Database Render mới là database **riêng**, không tự mang dữ liệu từ Docker PostgreSQL trên máy.
- Bản Render Free chỉ phù hợp để thử và minh họa. Web Free ngủ sau khi rảnh; Database Free hết hạn sau 30 ngày, không có backup. Muốn nhận webhook thanh toán tiền thật đáng tin cậy, phải sử dụng hạ tầng phù hợp, sao lưu và giám sát.

## Các bước trên Render Dashboard

1. Mở https://dashboard.render.com và đăng nhập bằng tài khoản phù hợp.
2. Chọn **New → Blueprint**. Kết nối GitHub với repo `TuanEm2/Brewlite`.
3. Đặt branch **chính xác** `feature/tv01-payos-from-tv04` (KHÔNG phải main). Blueprint path `render.yaml`.
4. Kiểm tra 3 tài nguyên được đề xuất: `brewlite-tv1-api`, `brewlite-tv1-web`, `brewlite-tv1-db`. Kiểm tra kế hoạch dịch vụ/trả phí trước khi xác nhận.
5. Bấm **Deploy Blueprint**. Render xây dựng Docker images từ `backend/Dockerfile`, `frontend/Dockerfile`; Backend dùng `DATABASE_URL` nội bộ của database Render. Docker Backend tự chạy `npx prisma migrate deploy` trước khi chạy server.
6. Khi hai dịch vụ báo **Live**, mở trang từng dịch vụ và sao chép URL HTTPS **thực tế** Render cấp. Không đoán domain từ tên dịch vụ.

## Gán URL thực tế (BẮT BUỘC)

Giả sử Render hiện hai URL (chỉ là ví dụ):

- `FRONTEND_URL_HTTPS` = URL trên trang Web service `brewlite-tv1-web`, thí dụ `https://brewlite-tv1-web-xyz.onrender.com`
- `BACKEND_URL_HTTPS` = URL trên trang Web service `brewlite-tv1-api`, thí dụ `https://brewlite-tv1-api-xyz.onrender.com`

Trong **Render → brewlite-tv1-api → Environment**:
- Sửa `FRONTEND_URL` từ `https://frontend.invalid` thành **FRONTEND_URL_HTTPS**.
- Giữ `PAYMENT_MODE=mock` trong giai đoạn kiểm tra.

Trong **Render → brewlite-tv1-web → Environment**:
- Sửa `NEXT_PUBLIC_API_URL` từ `https://api.invalid` thành **BACKEND_URL_HTTPS**.
- Giữ `NEXT_PUBLIC_PAYMENT_MODE=mock`.

Sau khi lưu phải **redeploy cả hai dịch vụ**. Đặc biệt **redeploy frontend (có bước build image)** vì Next.js đóng gói các biến NEXT_PUBLIC_* tại thời điểm build; chỉ restart process không đủ nếu URL cũ đã được đóng vào bundle.

Lưu ý: `render.yaml` có placeholder `.invalid` cố ý để bạn nhận biết bước cấu hình chưa hoàn tất; không gửi yêu cầu về địa chỉ placeholder. Nếu sau này Sync Blueprint ghi đè URL đã nhập, cập nhật `render.yaml` bằng URL thật rồi sync lại hoặc quản lý cài đặt tương ứng.

## Kiểm tra HTTPS

- Truy cập **BACKEND_URL_HTTPS** + `/api/health` → nhận JSON health thành công.
- Truy cập **FRONTEND_URL_HTTPS** → trang chủ BrewLite.
- Vào trình duyệt F12 → Network. Các request API phải đi đến **BACKEND_URL_HTTPS**, không phải localhost hay `api.invalid`. Trình duyệt không báo CORS error.
- Nếu DB trống, Menu sẽ trống nhưng điều đó **không có nghĩa API hỏng**. Việc Render deploy chỉ tạo schema bằng migration, không tự nạp dữ liệu. Cần một bước nhập dữ liệu riêng đã được kiểm tra an toàn.

## Dữ liệu mẫu / an toàn PostgreSQL

- Tuyệt đối KHÔNG chạy `npx prisma db seed` trên database có dữ liệu cần giữ; `backend/prisma/seed.ts` của nhóm có `TRUNCATE` và có chặn khi NODE_ENV=production.
- Không chạy `docker compose down -v` khi cần giữ dữ liệu Docker cũ.
- Muốn chuyển dữ liệu cũ từ máy lên Render cần backup, bảo vệ dữ liệu người dùng và thao tác nhập dữ liệu dưới sự quản lý của chủ môi trường.
- Render PostgreSQL tạo riêng có external access bị chặn từ bên ngoài theo `ipAllowList: []`. Backend vẫn dùng đường nội bộ để kết nối.

## Đăng ký webhook payOS SAU khi sẵn sàng

Khi Merchant account đã được xác minh hợp lệ bởi chủ tài khoản đủ điều kiện, và hạ tầng phục vụ giao dịch tiền thật đã được triển khai/đánh giá:

1. Backend phải có URL HTTPS thực tế, gọi là **BACKEND_URL_HTTPS**.
2. Webhook URL là: `BACKEND_URL_HTTPS/payments/payos/webhook`.
3. Trong Render API service Environment bổ sung **chỉ phía server** `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `PAYOS_RETURN_BASE_URL=FRONTEND_URL_HTTPS` và `PAYMENT_MODE=payos`. Không ghi secrets vào repo và không dùng biến `NEXT_PUBLIC_` cho secrets.
4. Trong Render Web service Environment đổi `NEXT_PUBLIC_PAYMENT_MODE=payos` và rebuild/redeploy frontend.
5. Đăng ký URL webhook trong payOS Dashboard/chức năng confirm-webhook. Đảm bảo mẫu xác nhận được xử lý nhưng không ghi Payment giả.
6. Kiểm thử xác minh chữ ký, amount, orderCode, các tình huống trùng webhook/timeout và đối soát tiền thực trước khi cho khách dùng.

**QUAN TRỌNG:** Gói Free có thể ngủ/mất khả dụng và DB có hạn; không khuyến nghị để thu tiền thật. Code payOS hiện chưa triển khai hoàn tiền/hủy link đầy đủ. Không đưa vào kinh doanh hoặc nhận tiền của khách trước khi hoàn thành kiểm thử bảo mật, sao lưu, độ ổn định, xử lý lỗi và hoàn tiền.

## Tài liệu nhà cung cấp

- https://render.com/docs/infrastructure-as-code
- https://render.com/docs/docker
- https://render.com/docs/free
- https://payos.vn/docs/api/
