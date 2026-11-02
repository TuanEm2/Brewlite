# TV4 — Khắc phục thiếu công thức nguyên liệu trên Render (02/11/2026)

**Phụ trách nhiệm vụ: TV4.** Đây là phần tiếp nối Task 10 — quản lý tồn kho nguyên liệu và hiển thị số ly trên FE.

## Hiện tượng và nguyên nhân

API `GET /products/1/availability?size=S` trả `configured: false, maxCups: null, ingredients: []`.
Điều này chứng minh **sản phẩm #1 chưa có bản ghi ProductIngredient**; không phải lỗi kết nối PostgreSQL.
Migration cũ `20261031000001_render_demo_catalog` chỉ nạp công thức khi Product, Ingredient
và ProductIngredient **đều trống**; dữ liệu Render có sản phẩm trước đó nên công thức bị bỏ qua.

## File được bổ sung

`backend/prisma/migrations/20261102210000_tv4_backfill_catalog_ingredients/migration.sql`

- Tự kiểm tra trùng tên sản phẩm và size/topping trước khi ghi.
- Chỉ thêm nguyên liệu mẫu còn thiếu; **nguyên liệu mới có stock = 0** do chưa có kiểm kê thực tế.
- Không thay đổi giá trị tồn kho của nguyên liệu đã có.
- Thêm các công thức nền size S/M/L cho Cà phê sữa, Americano, Cappuccino, Trà đào.
- Thêm định lượng topping Trân châu/Kem cho từng size.
- `ON CONFLICT DO NOTHING`: giữ nguyên công thức đã được nhóm tùy chỉnh.
- Không dùng `TRUNCATE`, `DELETE`, `prisma migrate reset`; không cập nhật đơn, thanh toán hay người dùng.

## Trước khi triển khai trên Render

1. **Sao lưu PostgreSQL Render**. Không áp dụng trực tiếp nếu có khách hàng và giao dịch chưa đối soát.
2. Kiểm tra migration trên bản sao DB và xác nhận dữ liệu size/topping của bốn đồ uống.
3. Xác định số tồn **đã kiểm kê thật** từng mã nguyên liệu trước khi mở nhận đơn.
4. Deploy Backend branch `main` sau khi PR TV4 được merge; Dockerfile tự gọi `npx prisma migrate deploy`.
5. Kiểm tra API `/products/1/availability?size=S`. Sau khi có công thức, `configured: true` và `ingredients` có dữ liệu.
6. Nếu `maxCups: 0`, **đó là kết quả đúng khi chưa nhập tồn kho**, không phải lỗi API. Backend sẽ chặn đặt món để không bán quá số tồn.

## Kiểm tra dữ liệu trên môi trường thử nghiệm (SQL chỉ đọc)

```sql
SELECT "code", "name", "unit", "stock", "version" FROM "Ingredient" ORDER BY "code";
SELECT p."name", pi."size", pi."topping", i."code", pi."quantity"
FROM "ProductIngredient" pi
JOIN "Product" p ON p."id" = pi."productId"
JOIN "Ingredient" i ON i."id" = pi."ingredientId"
ORDER BY p."name", pi."size", pi."topping", i."code";
```

Không tự điền số lượng tồn giả cho một database đang nhận thanh toán. Việc cập nhật tồn kho phải dựa trên kiểm kê thật và áp dụng giao dịch an toàn có người duyệt.

## Kiểm thử

- Migration trên PostgreSQL test; code CI: Prisma migrate deploy, typecheck, unit/e2e, build.
- Kiểm tra `configured:true` cho product có recipe.
- Cảnh báo hết nguyên liệu (maxCups = 0) nếu chưa có tồn.
- Giữ nguyên Order/Payment/PayosCheckout và inventory phiên bản cũ.

> Lịch sử Git ghi tài khoản thực tế tạo commit; TV4 là vai trò chịu trách nhiệm kiểm tra/tiếp nhận công việc này, không khẳng định TV4 tự thực hiện mọi commit.
