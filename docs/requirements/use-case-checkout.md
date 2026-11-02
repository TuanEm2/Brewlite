# Use-case Đặt và thanh toán đơn hàng

## 1. Thông tin chung

- Mã use-case đề xuất: UC-CHECKOUT.
- Người phụ trách: TV3.
- Trạng thái: Bản nháp, chờ đối chiếu SRS của TV2 và review nhóm.
- Phạm vi: BrewLite Assignment 2.
- Mục tiêu: Khách hàng tạo đơn từ giỏ hàng, thanh toán mô phỏng
  và xem kết quả, lịch sử của chính mình.
- Actor chính: Customer (Khách hàng).
- Actor hỗ trợ: Payment Service (Dịch vụ thanh toán mô phỏng).
- Trigger: Khách hàng chọn Thanh toán tại giỏ hàng.

Payment Service là vai trò dịch vụ bên ngoài trong mô hình nghiệp vụ.
Trong bản triển khai hiện tại, dịch vụ này được mô phỏng bằng module
payments bên trong NestJS; không kết nối ngân hàng hoặc ví thật.

## 2. Tiền điều kiện

- Khách hàng đã chọn sản phẩm cùng size, topping và số lượng.
- Giỏ hàng có ít nhất một món.
- Hệ thống có dữ liệu sản phẩm để kiểm tra giá và tồn kho.
- Khách hàng phải có phiên đăng nhập hợp lệ trước khi tạo đơn.
  Nếu chưa đăng nhập, thực hiện luồng A1.

## 3. Hậu điều kiện

### Thành công

- Đơn thuộc đúng tài khoản khách hàng và có trạng thái PAID.
- Tổng tiền được backend tính và lưu.
- Tồn kho được trừ khi tạo đơn PENDING thành công.
- Thanh toán được ghi nhận một lần.
- Khách hàng thấy mã đơn, số tiền và kết quả thanh toán.
- Đơn xuất hiện trong lịch sử của khách hàng.
- Giỏ hàng gắn với đơn đã thanh toán được xử lý hoàn tất;
  không xóa món mới mà khách thêm sau khi tạo đơn.

### Không thành công

- Nếu tạo đơn thất bại, không lưu đơn dở dang hoặc trừ kho một phần.
- Nếu thanh toán bị từ chối, đơn ở PAYMENT_FAILED và giỏ được giữ.
- Nếu mất kết nối, giao diện không tự kết luận thanh toán thất bại:
  kết quả tại server có thể đã được ghi nhận.
- Khách hàng không được đọc hoặc thanh toán đơn của tài khoản khác.

## 4. Luồng chính

1. Khách hàng mở giỏ hàng.
2. Hệ thống hiển thị các món, tùy chọn, số lượng và tổng tạm tính.
3. Khách hàng điều chỉnh giỏ và chọn Thanh toán.
4. Hệ thống kiểm tra phiên đăng nhập và dữ liệu đầu vào.
5. Giao diện gửi yêu cầu tạo đơn kèm JWT và idempotency key.
6. Backend kiểm tra sản phẩm, tùy chọn, số lượng và tồn kho;
   tính lại tổng tiền bằng dữ liệu phía server.
7. Backend tạo đơn PENDING và cập nhật tồn kho trong cùng transaction.
8. Giao diện mở trang checkout, tải thông tin đơn từ backend.
9. Khách hàng chọn Ví hoặc Thẻ mô phỏng và xác nhận thanh toán.
10. Giao diện gửi yêu cầu thanh toán kèm JWT và idempotency key.
11. Backend xác minh quyền sở hữu, trạng thái đơn và khóa chống lặp;
    xử lý kết quả thanh toán thành công.
12. Backend lưu thanh toán và chuyển đơn sang PAID.
13. Giao diện hiển thị xác nhận cùng mã đơn và số tiền từ backend.
14. Khách hàng có thể mở lịch sử để xem đơn và trạng thái.

## 5. Luồng thay thế

### A1. Chưa đăng nhập hoặc phiên hết hạn

- Khi cần xác thực, hệ thống yêu cầu khách đăng nhập.
- Giữ nội dung giỏ hàng.
- Sau đăng nhập, quay lại giỏ hoặc checkout phù hợp.
- Backend từ chối yêu cầu không có JWT hợp lệ.

### A2. Điều chỉnh giỏ

- Khách tăng/giảm số lượng hoặc xóa món.
- Hệ thống cập nhật tổng tạm tính.
- Giỏ trống không được tạo đơn.
- Giá và tồn kho hiển thị chỉ là thông tin tạm;
  backend kiểm tra lại khi tạo đơn.

### A3. Thanh toán mô phỏng thất bại

- Backend ghi nhận kết quả thất bại và trạng thái PAYMENT_FAILED.
- Giao diện thông báo rõ, giữ giỏ và cho phép thử lại.
- Một lần thử mới sau kết quả thất bại đã xác định dùng khóa mới.
- Khách có thể đổi phương thức thanh toán cho lần thử mới.

### A4. Gửi lại yêu cầu sau lỗi mạng

- Nếu chưa biết kết quả tạo đơn, gửi lại cùng nội dung và khóa tạo đơn.
- Nếu chưa biết kết quả thanh toán, gửi lại cùng nội dung và khóa thanh toán.
- Backend trả lại kết quả đã xử lý mà không tạo bản ghi nghiệp vụ trùng.
- Khi đổi nội dung yêu cầu, không tái sử dụng khóa của yêu cầu cũ.
- Trước một lần thanh toán mới sau kết quả chưa rõ, cần kiểm tra
  trạng thái đơn; backend vẫn phải ngăn thanh toán trùng.

### A5. Xem lịch sử và theo dõi đơn

- Khách mở trang lịch sử.
- Hệ thống chỉ trả các đơn thuộc tài khoản đang đăng nhập.
- Hiển thị đơn mới nhất trước cùng trạng thái và tổng tiền.
- Nếu chưa có đơn, hiển thị trạng thái trống và đường dẫn tới menu.
- Cho phép xem chi tiết đơn; đơn còn được phép thanh toán
  có thể quay lại checkout.

### A6. Voucher kế thừa từ Assignment 1

- Khách có thể nhập voucher nếu tính năng được giữ trong SRS.
- Backend kiểm tra điều kiện và tính giảm giá.
- Voucher không hợp lệ phải có thông báo; không tạo đơn hoặc trừ kho.
- Phạm vi voucher và loyalty của Assignment 2 chờ TV2/TV1 chốt.
- Đây không phải điều kiện bắt buộc của luồng checkout cơ bản.

## 6. Luồng ngoại lệ

| Mã | Tình huống | Xử lý mong muốn |
|---|---|---|
| E1 | Giỏ trống hoặc dữ liệu không hợp lệ | Chặn tạo đơn, chỉ rõ vấn đề |
| E2 | Sản phẩm hoặc tùy chọn không còn hợp lệ | Báo lỗi, giữ giỏ để khách chỉnh |
| E3 | Không đủ tồn kho hoặc xung đột cập nhật kho | Báo lỗi; transaction không để đơn/kho cập nhật dở dang |
| E4 | JWT thiếu, sai hoặc hết hạn | Không thực hiện thao tác; yêu cầu đăng nhập |
| E5 | Đơn không tồn tại hoặc không thuộc khách | Không trả dữ liệu đơn; hiển thị thông báo phù hợp |
| E6 | Mất mạng hoặc server lỗi | Giữ dữ liệu cần thử lại, tránh thông báo thành công sai |
| E7 | Đơn đã thanh toán hoặc không còn được phép thanh toán | Không tạo thanh toán mới; tải lại trạng thái |
| E8 | Cùng idempotency key nhưng nội dung khác | Từ chối xung đột, không sửa giao dịch trước |

## 7. Quy tắc nghiệp vụ

- Backend là nguồn quyết định giá, giảm giá và số tiền thanh toán.
- Giá dòng = (giá gốc + phụ thu size + tổng topping) × số lượng.
- Không chấp nhận đơn có tổng nhu cầu vượt tồn kho.
- Tạo đơn và cập nhật kho phải nguyên tử: cùng thành công hoặc cùng hủy.
- Tạo đơn PENDING chưa đồng nghĩa thanh toán thành công.
- Chỉ hiển thị thanh toán thành công khi có kết quả xác nhận từ backend.
- Cùng yêu cầu gửi lại không được tạo đơn hoặc thanh toán trùng.
- Mỗi khách chỉ được truy cập đơn của mình.
- Không yêu cầu nhập số thẻ hoặc thông tin thanh toán thật.
- Hủy đơn là nghiệp vụ riêng, không đồng nghĩa với thanh toán thất bại.

## 8. API đối chiếu với bản nền

Bản nền đã đọc: commit 20bcecf.
Các endpoint dưới đây phải được đối chiếu lại nếu TV5/TV6 đổi API contract.

| API | Mục đích |
|---|---|
| POST /orders | Tạo đơn từ giỏ |
| GET /orders/:id | Lấy chi tiết đơn thuộc tài khoản |
| POST /payments | Thanh toán mô phỏng |
| POST /payments/mock | Alias mà giao diện kế thừa đang gọi |
| GET /orders/me | Lịch sử đơn cá nhân |

Các API trên yêu cầu JWT.
Khóa idempotency hiện được gửi trong JSON body.

## 9. Tiêu chí chấp nhận đề xuất

Các mã AC dưới đây là mã nội bộ của bản nháp, chưa thay thế mã FR trong SRS.

- AC-01: Giỏ cập nhật đúng số lượng, thành tiền và tổng tạm tính.
- AC-02: Giỏ trống không gửi yêu cầu tạo đơn.
- AC-03: Chưa đăng nhập được chuyển tới đăng nhập và giữ giỏ.
- AC-04: Tạo đơn hợp lệ trả PENDING; giá lấy từ backend, kho trừ đúng.
- AC-05: Hết hàng không tạo đơn hoặc trừ kho một phần.
- AC-06: Thanh toán thành công hiển thị đúng mã đơn và số tiền.
- AC-07: Thanh toán thất bại giữ giỏ và cho phép thử lại.
- AC-08: Retry cùng yêu cầu không tạo đơn/thanh toán trùng.
- AC-09: Món thêm sau khi tạo đơn không bị xóa khi thanh toán đơn cũ.
- AC-10: Lịch sử chỉ hiển thị đơn của tài khoản hiện tại.
- AC-11: Có loading, error và empty phù hợp từng màn hình.
- AC-12: Đơn không tồn tại/không thuộc khách không làm lộ dữ liệu.

## 10. Liên kết yêu cầu và minh chứng

Chờ nhận SRS của TV2 để điền mã FR/NFR chính thức cho:
- Giỏ hàng.
- Xác thực.
- Tạo đơn và tồn kho.
- Thanh toán và idempotency.
- Lịch sử/trạng thái đơn.
- Bảo mật và xử lý lỗi.

Sơ đồ dự kiến:
- docs/diagrams/use-case-checkout.puml
- docs/diagrams/use-case-checkout.svg

Sau khi thống nhất SRS, cập nhật mapping:
FR/NFR → UC-CHECKOUT → sơ đồ → code/API → test.

### Đối chiếu kiểm thử TV3 ngày 30/10/2026

Đã chạy trên máy phát triển:
- Frontend: 5 test suites, 17 tests PASS.
- Frontend typecheck: không báo lỗi.
- API trong các test giao diện được giả lập.
- Chưa kiểm thử tích hợp với backend kho nguyên liệu của TV4.
- Mã AC là mã nội bộ; chưa thay thế mã FR/NFR chính thức của SRS.

Các file test nằm trong frontend/__tests__/.

| Tiêu chí | Minh chứng hiện có | Phần còn cần kiểm tra |
|---|---|---|
| AC-01 | cart.test.tsx: tăng/giảm số lượng, xóa món, cập nhật tổng | Kiểm tra thao tác trên trình duyệt thật |
| AC-02 | cart.test.tsx: giỏ trống không gọi API tạo đơn | Kiểm tra với API thật |
| AC-03 | cart.test.tsx: chuyển đăng nhập và giữ giỏ khi chưa có token | Luồng đăng nhập rồi quay lại giỏ |
| AC-04 | cart-create-order.test.tsx: gửi đúng món và JWT, mở checkout theo ID API trả về, lưu đơn chờ và giữ giỏ | POST /orders thật: PENDING, giá và kho đúng |
| AC-05 | cart-inventory.test.tsx: HTTP 409 hiện lỗi, giữ giỏ, không chuyển checkout | Backend không lưu đơn hoặc trừ kho một phần |
| AC-06 | checkout.test.tsx: thanh toán thành công và hiển thị xác nhận | Thanh toán với API/database thật |
| AC-07 | checkout.test.tsx: thất bại giữ giỏ và cho phép thử lại | Thất bại rồi thử lại thành công với API thật |
| AC-08 | checkout.test.tsx: lỗi mạng rồi gửi lại cùng khóa thanh toán | Backend chống trùng; retry yêu cầu tạo đơn |
| AC-09 | checkout.test.tsx: giữ giỏ đã thay đổi; kiểm tra tài khoản và voucher | Kiểm tra thao tác trên trình duyệt thật |
| AC-10 | orders.test.tsx: gửi JWT và hiển thị lịch sử từ API giả lập | Hai tài khoản thật không xem được đơn của nhau |
| AC-11 | Test giỏ/lịch sử trống, lỗi lịch sử 401/500 và lỗi thanh toán | Loading và các lỗi còn lại trên từng màn hình |
| AC-12 | Chưa có test frontend riêng cho đơn không tồn tại/không thuộc khách | Kiểm tra giao diện và phân quyền backend |

Không dùng kết quả test giao diện để kết luận kho nguyên liệu,
transaction hoặc phân quyền backend đã đạt.