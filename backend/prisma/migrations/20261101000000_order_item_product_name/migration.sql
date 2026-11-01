-- TV3: lưu tên đồ uống vào từng dòng đơn để hóa đơn/lịch sử hiện tên thay vì "Đồ uống #id".
-- Chỉ thêm cột và điền tên cho các dòng đơn cũ từ bảng Product; không xóa hay đổi dữ liệu khác.
ALTER TABLE "OrderItem" ADD COLUMN "productName" TEXT;

UPDATE "OrderItem" AS oi
SET "productName" = p."name"
FROM "Product" AS p
WHERE p."id" = oi."productId";

ALTER TABLE "OrderItem" ALTER COLUMN "productName" SET NOT NULL;
