# TV2 bàn giao cơ sở dữ liệu nguyên liệu cho TV4

## Phần đã chuẩn bị

Phần này bổ sung dữ liệu để chuyển từ giới hạn theo sản phẩm sang kiểm tra nguyên liệu dùng chung. Đây là nền CSDL cho TV4; service tạo/hủy đơn, API trạng thái hết hàng và giao diện chưa tự dùng các bảng mới.

Migration `20261029000000_ingredient_inventory` chỉ thêm enum, bảng, khóa và CHECK; không xóa bảng/cột hoặc sửa tồn kho/đơn hàng hiện có.

| Model | Công dụng |
|---|---|
| `Ingredient` | Mã nguyên liệu duy nhất, tên, đơn vị `G`/`ML`/`PIECE`, `stock` và `version` để khóa lạc quan. |
| `ProductIngredient` | Định lượng cho một ly của đúng sản phẩm và size; quan hệ `Product.ingredients`, mỗi dòng có `.ingredient`. |
| `OrderIngredient` | Snapshot tổng lượng nguyên liệu đã giữ/trừ cho một đơn; quan hệ `Order.ingredientUsages`. Dùng để hoàn kho đúng lượng khi hủy dù công thức đã đổi. |

## Đơn vị và độ chính xác

- Dùng đơn vị gốc: gram, milliliter, cái. Ví dụ 1 kg nhập thành 1000 G; 1 lít nhập thành 1000 ML.
- Tồn kho `Decimal(14,3)`; định lượng mỗi ly `Decimal(12,3)`. Dùng `Prisma.Decimal` cho cộng/nhân/so sánh/trừ; không chuyển qua số thực JavaScript rồi tính tồn kho.
- `Ingredient.version` bắt đầu từ 0; TV4 phải tăng sau mỗi lần đổi tồn kho. Cột không tự tăng khi chỉ cập nhật stock.
- Migration chặn stock âm, version âm, tồn PIECE không nguyên, định lượng <= 0 và tên topping có khoảng trắng đầu/cuối. Dịch vụ phải kiểm tra thêm định lượng nguyên cho nguyên liệu đơn vị PIECE và lựa chọn hợp lệ của sản phẩm.
- Các CHECK là SQL tùy chỉnh, không được Prisma biểu diễn trong `schema.prisma`. Giữ chúng khi viết migration sau.

## Cách đọc công thức

- `size` là `S`, `M` hoặc `L`; luôn chọn công thức của đúng size.
- `topping: ''` là công thức nền, luôn dùng.
- `topping: 'Kem'` hoặc `'Trân châu'` là lượng cộng thêm, chỉ dùng khi khách chọn topping đó. Không cộng mọi topping vào mọi ly.
- Khóa duy nhất: `(productId, ingredientId, size, topping)`.
- Một nguyên liệu có thể nằm trong nhiều sản phẩm và cả phần nền/topping; cần cộng nhu cầu theo `ingredientId`.

Ví dụ đọc công thức trong service của TV4:

```ts
const product = await tx.product.findUniqueOrThrow({
  where: { id: productId },
  include: {
    ingredients: {
      where: { size: selectedSize, topping: { in: ['', ...selectedToppings] } },
      include: { ingredient: true },
    },
  },
});
```

`selectedSize` dùng enum `RecipeSize` và tên topping phải được validate trước. Tổng nhu cầu mỗi nguyên liệu = định lượng mỗi ly × số ly, cộng cho tất cả dòng trong cùng đơn. Không tính riêng từng món rồi bỏ qua nguyên liệu dùng chung.

## Bộ dữ liệu demo

Các số dưới đây do TV2 chọn để minh họa kiểm thử, không phải công thức cửa hàng thật.

| Code | Nguyên liệu | Đơn vị | Tồn ban đầu |
|---|---|---|---:|
| COFFEE | Cà phê | G | 1000 |
| CONDENSED_MILK | Sữa đặc | ML | 1000 |
| FRESH_MILK | Sữa tươi | ML | 2000 |
| TEA | Trà | G | 500 |
| PEACH_SYRUP | Siro đào | ML | 1000 |
| WATER | Nước | ML | 10000 |
| PEARL | Trân châu | G | 1000 |
| CREAM | Kem | G | 1000 |
| CUP | Ly | PIECE | 100 |

| Sản phẩm | Size S | Size M | Size L |
|---|---|---|---|
| Cà phê sữa | Cà phê 18g, sữa đặc 25ml, nước 60ml | Cà phê 22g, sữa đặc 30ml, nước 80ml | Cà phê 26g, sữa đặc 35ml, nước 100ml |
| Americano | Cà phê 18g, nước 120ml | Cà phê 22g, nước 160ml | Cà phê 26g, nước 200ml |
| Cappuccino | Cà phê 18g, sữa tươi 120ml | Cà phê 22g, sữa tươi 160ml | Cà phê 26g, sữa tươi 200ml |
| Trà đào | Trà 5g, nước 120ml, siro đào 20ml | Trà 6g, nước 160ml, siro đào 25ml | Trà 7g, nước 200ml, siro đào 30ml |

Mỗi ly của mọi size dùng thêm 1 CUP. Nếu chọn topping: mỗi ly cộng 30g PEARL hoặc 20g CREAM, không đổi theo size.

Ví dụ 2 Cappuccino M + Kem cần 44g COFFEE, 320ml FRESH_MILK, 2 CUP và 40g CREAM. Không chọn Kem thì không được trừ CREAM.

## Nạp mẫu và áp dụng migration

Local, sau khi cấu hình DATABASE_URL của môi trường demo:

```powershell
npm run prisma:generate -w @brewlite/backend
npm run prisma:deploy -w @brewlite/backend
npm run prisma:seed:ingredients -w @brewlite/backend
```

Script cần đúng một sản phẩm mang mỗi tên `Cà phê sữa`, `Americano`, `Cappuccino`, `Trà đào` với đủ S/M/L và hai topping như bộ mẫu. Script không dựa vào id 1..4, kiểm tra trước khi ghi và chạy trong transaction.

Với Docker demo đang chạy:

```powershell
docker compose up --build -d
docker compose exec -e NODE_ENV=development backend npm run prisma:seed:ingredients
```

Backend tự chạy `prisma migrate deploy` khi khởi động. Lệnh thứ hai chỉ nạp dữ liệu demo và không dùng cho production. Script mới không xóa đơn/sản phẩm, không tự nạp lại tồn kho và không ghi đè định lượng đã có khi chạy lặp. Không dùng seed cũ `prisma:seed` để cập nhật nguyên liệu vì seed cũ xóa dữ liệu demo.

## Việc TV4 cần nối tiếp

1. Đọc công thức nền + topping được chọn, cộng nhu cầu nguyên liệu cho toàn đơn. Thiếu công thức phải báo lỗi cấu hình, không âm thầm chỉ dựa vào `Product.stock`.
2. Trong cùng transaction tạo PENDING: kiểm tra và trừ Product.stock theo quy tắc hiện tại; cập nhật từng Ingredient bằng điều kiện `id`, `version` cũ, `stock >= nhu cầu`, rồi tăng version. Nếu bất kỳ update nào count != 1 thì rollback và báo xung đột/hết nguyên liệu.
3. Ghi tổng nhu cầu đã trừ vào OrderIngredient trong chính transaction đó. Không trừ thêm nguyên liệu ở bước thanh toán hoặc khi replay cùng yêu cầu.
4. Khi hủy, hoàn theo snapshot OrderIngredient và chặn hoàn lần hai bằng cơ chế trạng thái/khóa đơn hiện có. Đơn cũ không có snapshot thì không tự tính công thức mới để hoàn nguyên liệu.
5. API/menu phải tính khả dụng theo nguyên liệu: hết sữa nền thì Cappuccino tương ứng hết hàng dù còn ly; hết Kem chỉ làm lựa chọn topping Kem không khả dụng, không chặn đồ uống không Kem. Tồn kho thật phải được kiểm tra lại khi tạo đơn.

## Tiêu chí kiểm thử

Đã có `backend/test/ingredients-schema.e2e-spec.ts` cho quan hệ dùng chung, số thập phân, recipe trùng, các CHECK, snapshot và seed lặp không tăng kho. Chỉ chạy trên DATABASE_URL có tên database chứa `test`.

```powershell
npm run test:e2e -w @brewlite/backend -- --runInBand --runTestsByPath test/ingredients-schema.e2e-spec.ts
```

Sau khi TV4 tích hợp, cần thêm test nghiệp vụ: thiếu sữa nhưng còn ly; size khác định lượng; chỉ trừ topping đã chọn; hai sản phẩm dùng chung nguyên liệu; đặt đồng thời không âm kho; replay không trừ hai lần; hủy hoàn đúng snapshot. Các luồng đó chưa được hiện thực bởi phần schema này.

## Kết quả kiểm tra ngày 29/10/2026

- Prisma format, validate và generate: đạt.
- Backend typecheck và build: đạt.
- Bộ unit test hiện có: 164/164 đạt.
- Test PostgreSQL mới: 6/6 đạt, gồm kiểm tra seed lặp giữ tồn kho/công thức.
- Đã nâng cấp từ 4 migration cũ lên migration nguyên liệu trên database thử riêng bằng PostgreSQL 18 cài trên máy; sản phẩm, user, đơn hàng, stock và version trước nâng cấp được giữ nguyên.
- Đối chiếu database sau migration với Prisma schema: không có sai khác cấu trúc do Prisma quản lý. CHECK tùy chỉnh nằm trong migration.
- Chưa áp dụng bản mới lên database Docker đang dùng để demo. Docker Compose của dự án dùng PostgreSQL 16; CI có cấu hình kiểm thử với phiên bản đó, chưa có kết quả CI cho thay đổi này.
