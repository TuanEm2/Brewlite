# Sprint 1 — Task 4: Chi tiết đồ uống — TV5

## Phạm vi
- Nhánh làm việc: feature/tv05.
- Kế thừa feature/tv04 tại commit 60c178c.
- Người nhận tiếp: TV6.

## Thay đổi
- Thêm frontend/app/products/[id]/page.tsx.
- Gọi GET /products/:id để lấy thông tin sản phẩm.
- Chọn một size và nhiều topping từ dữ liệu API.
- Giá một ly = giá gốc + phụ thu size + tổng phụ thu topping.
- Hiển thị loading, lỗi kết nối, mã không hợp lệ và sản phẩm không tồn tại.
- Có nút thử lại và liên kết quay lại menu.
- Sửa frontend/app/menu/page.tsx để nút Chọn món mở trang chi tiết.

## Cách chạy
Dùng Node.js, npm và PostgreSQL theo README của dự án.
Cấu hình frontend/.env.local và backend/.env từ file mẫu.
Không commit mật khẩu hoặc file .env.

Từ thư mục gốc, chạy ở hai terminal:
- npm.cmd run dev:api
- npm.cmd run dev:web

Mở http://localhost:3000/menu và chọn một sản phẩm.

## Kết quả kiểm thử trên máy TV5
- Typecheck frontend/backend: đạt.
- Unit test backend có sẵn: 14/14 đạt.
- Test API sản phẩm có sẵn: 18/18 đạt.
- Build: đạt, mã kết thúc 0.
- Menu → chi tiết: người thực hiện xác nhận hoạt động.
- Cappuccino S, không topping: 45.000đ.
- Cappuccino M, không topping: 50.000đ.
- Cappuccino L, cả hai topping: 70.000đ.
- Cappuccino L, chỉ Trân châu: 60.000đ.
- Mã 999999: hiển thị sản phẩm không tồn tại.
- Mã abc: hiển thị mã không hợp lệ.
- Tắt backend: hiển thị lỗi kết nối.
- Bật lại backend và bấm Thử lại: tải được sản phẩm.

Các tình huống giao diện và giá được kiểm tra thủ công.
Các test tự động nêu trên thuộc backend, chưa kiểm tra giao diện TV5.

## Phụ thuộc và việc còn lại
- TV6 xác nhận quy ước phụ thu size/topping và kiểm thử tích hợp.
- Giỏ hàng thuộc Sprint 2, chưa tích hợp nút thêm giỏ.
- Giá phải được backend tính lại khi triển khai tạo đơn.
- Menu hiện vẫn dùng biểu tượng tạm; chưa hiển thị imageUrl sản phẩm.
- npm audit báo 37 lỗ hổng ở lần cài đặt; cần nhóm đánh giá,
  chưa tự động nâng cấp dependency.
- Lịch sử nhánh kế thừa hiện chỉ thấy một commit; đã ghi nhận
  để nhóm trưởng kiểm tra.