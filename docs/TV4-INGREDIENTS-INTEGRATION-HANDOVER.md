# TV4 bàn giao hoàn thiện dữ liệu seed và kịch bản test tồn kho nguyên liệu

## Phần đã thực hiện

Phần này hoàn thiện kịch bản seed dữ liệu mẫu chung cho cả sản phẩm, nguyên liệu và công thức pha chế, phục vụ cho việc kiểm thử tính năng quản lý tồn kho nguyên liệu và khóa lạc quan (optimistic locking) của TV4.

Lệnh seed chính của dự án (`npx prisma db seed`) đã được tích hợp trực tiếp hàm khởi tạo nguyên liệu và công thức vào file `prisma/seed.ts`, loại bỏ rủi ro thiếu dữ liệu nguyên liệu khi triển khai môi trường mới.

| Thành phần | Trạng thái | Công dụng |
|---|---|---|
| `prisma/seed.ts` | Hoàn thành | Tự động làm sạch dữ liệu cũ (`TRUNCATE`), tạo 4 sản phẩm mẫu, 9 loại nguyên liệu kho và liên kết công thức (`ProductIngredient`) chi tiết theo từng size/topping. |
| `Ingredient` | Hoàn thành | Đã nạp 9 nguyên liệu nền ban đầu với số lượng tồn kho định sẵn. |
| `ProductIngredient` | Hoàn thành | Đã thiết lập công thức tiêu hao chi tiết cho 4 sản phẩm chính kèm quy chuẩn topping. |
| Quản lý Git | Hoàn thành | Khởi tạo lại kho lưu trữ tại thư mục gốc và sẵn sàng đẩy code lên nhánh `feature/tv04`. |

---

## Cấu trúc dữ liệu Seed chi tiết

### 1. Danh mục 9 nguyên liệu chính

| Code | Tên nguyên liệu | Đơn vị (`unit`) | Tồn kho ban đầu (`stock`) |
|---|---|---|---:|
| `COFFEE` | Cà phê | G | 1000 |
| `CONDENSED_MILK` | Sữa đặc | ML | 1000 |
| `FRESH_MILK` | Sữa tươi | ML | 2000 |
| `TEA` | Trà | G | 500 |
| `PEACH_SYRUP` | Siro đào | ML | 1000 |
| `WATER` | Nước | ML | 10000 |
| `PEARL` | Trân châu | G | 1000 |
| `CREAM` | Kem | G | 1000 |
| `CUP` | Ly | PIECE | 100 |

### 2. Định lượng công thức sản phẩm (S / M / L)

- **Mọi ly của mọi sản phẩm** đều tiêu hao `1 CUP` (Ly).
- **Topping chọn thêm**:
  - `Trân châu`: `30g PEARL`
  - `Kem`: `20g CREAM`

| Sản phẩm | Định lượng Size S | Định lượng Size M | Định lượng Size L |
|---|---|---|---|
| **Cà phê sữa** | 18g COFFEE, 25ml CONDENSED_MILK, 60ml WATER | 22g COFFEE, 30ml CONDENSED_MILK, 80ml WATER | 26g COFFEE, 35ml CONDENSED_MILK, 100ml WATER |
| **Americano** | 18g COFFEE, 120ml WATER | 22g COFFEE, 160ml WATER | 26g COFFEE, 200ml WATER |
| **Cappuccino** | 18g COFFEE, 120ml FRESH_MILK | 22g COFFEE, 160ml FRESH_MILK | 26g COFFEE, 200ml FRESH_MILK |
| **Trà đào** | 5g TEA, 120ml WATER, 20ml PEACH_SYRUP | 6g TEA, 160ml WATER, 25ml PEACH_SYRUP | 7g TEA, 200ml WATER, 30ml PEACH_SYRUP |

---

## Quyền thao tác và Lệnh vận hành

### 1. Lệnh nạp lại dữ liệu (Seed)
Tại thư mục `backend`:
```powershell
npx prisma db seed
```
*Lưu ý: Lệnh này sẽ `TRUNCATE` các bảng liên quan để reset sạch sẽ dữ liệu mẫu về ID ban đầu (1..4).*

### 2. Mở giao diện Prisma Studio kiểm tra/chỉnh sửa kho
```powershell
npx prisma studio
```

### 3. Đẩy code lên nhánh `feature/tv04`
Tại thư mục gốc dự án (`C:\Users\lengu\Downloads\Brewlite-feature-tv02`):
```powershell
git add .
git commit -m "Cap nhat seed script va hoan thien kien truc kho"
git push -u origin feature/tv04
```

---

## Kết quả kiểm thử kịch bản chặn đặt hàng (E2E Manual)

1. **Khởi tạo môi trường**:
   - Đã chạy `npx prisma db seed` thành công, bảng `Ingredient` có 9 dòng, `ProductIngredient` có đủ định lượng.
2. **Kịch bản hết Ly/Sữa (`CUP` / `FRESH_MILK`)**:
   - Dùng Prisma Studio chỉnh `stock` của `CUP` hoặc `FRESH_MILK` về `0`.
   - Đặt món `Cappuccino` hoặc bất kỳ món nào trên giao diện web.
3. **Kết quả kỳ vọng & Thực tế**:
   - Giao diện/API từ chối tạo đơn thành công, trả về thông báo hết nguyên liệu chuẩn xác theo logic kiểm tra tồn kho.

---

## Kết quả kiểm tra ngày 30/10/2026

- **Prisma Seed**: Đạt 100%. Đã hợp nhất seed Sản phẩm và Seed Nguyên liệu vào làm một.
- **Prisma Studio**: Đạt. Hiển thị đúng quan hệ `ProductIngredient` và số lượng `Decimal`.
- **Git Branching**: Đã khởi tạo Git tại root, chuyển sang làm việc trên nhánh `feature/tv04` và sẵn sàng đồng bộ lên repository `TuanEm2/Brewlite.git`.