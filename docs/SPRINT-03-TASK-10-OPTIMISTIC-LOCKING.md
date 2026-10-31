# Sprint 3 — Task 10: Optimistic Locking & Quản lý Tồn kho (TV4)

## User Story / Goal

Là hệ thống, tôi muốn áp dụng **Optimistic Locking** cho sản phẩm/tồn kho và trừ kho chính xác khi đặt hàng, để tránh tình trạng bán vượt quá số lượng tồn kho (overselling) khi có nhiều khách hàng mua cùng lúc. Đây là nghiệp vụ phần tồn kho của Task 10.

## Acceptance Criteria

- [x] Thêm trường `version` (kiểu `Int`) vào bảng sản phẩm (`Product`) trong Prisma Schema để hỗ trợ cơ chế Optimistic Locking.
- [x] Khi cập nhật số lượng tồn kho hoặc đặt hàng, hệ thống kiểm tra điều kiện `version` khớp với lúc đọc dữ liệu ban đầu.
- [x] Xử lý ngoại lệ đồng thời: nếu có 2 giao dịch cùng trừ kho sản phẩm một lúc, giao dịch thứ hai sẽ bị phát hiện xung đột và báo lỗi (trả về mã lỗi 409 hoặc ngoại lệ tương ứng).
- [x] Tích hợp việc trừ kho nằm trong cùng transaction với quá trình tạo đơn hàng / thanh toán.
- [x] Đã chạy vượt qua toàn bộ unit test và integration test liên quan đến concurrency/tồn kho (144 unit tests across 13 suites pass).

## Mô hình dữ liệu & Cơ chế Optimistic Locking

```text
[Đọc sản phẩm (stock, version)] ──▶ [Kiểm tra điều kiện & tính toán] ──▶ [Update: stock = stock - qty, version = version + 1 WHERE id = id AND version = old_version]
                                                                                     │
                                                                       Thành công ◄──┴──▶ Thất bại (Xung đột đồng thời -> Ném lỗi 409)
```

| Thành phần | Mô tả chi tiết |
|---|---|
| `backend/prisma/schema.prisma` | Bổ sung trường `version Int @default(1)` vào model `Product`. |
| `backend/src/products/products.service.ts` | Xử lý logic cập nhật sản phẩm và lấy thông tin phiên bản. |
| `backend/src/orders/orders.service.ts` | Giao dịch đặt hàng thực hiện trừ tồn kho theo cơ chế Optimistic Locking. |
| `backend/src/orders/orders-concurrency.spec.ts` | Unit/Integration test giả lập xung đột đồng thời khi mua hàng. |

### Quy tắc nghiệp vụ

- **Optimistic Locking**: Thay vì khóa cứng cơ sở dữ liệu (Pessimistic/For Update) gây nghẽn cổ chai, mô hình sử dụng số phiên bản (`version`). Mỗi lần update thành công, `version` tự động tăng lên 1.
- **Xử lý xung đột**: Nếu câu lệnh update không khớp `version` cũ (do có giao dịch khác vừa đổi trước), hệ thống xác định có tranh chấp, hủy transaction và báo lỗi đồng thời để đảm bảo an toàn kho.
- **Hoàn trả kho (nếu cần)**: Khi đơn hàng chuyển sang trạng thái `CANCELLED`, gọi dịch vụ hoàn lại số lượng tồn kho tương ứng cho sản phẩm.

## Ví dụ mã nguồn

```ts
// Logic cập nhật tồn kho với Optimistic Locking trong Prisma
const updatedProduct = await prisma.product.updateMany({
  where: {
    id: productId,
    version: currentVersion,
    stock: { gte: quantityToBuy },
  },
  data: {
    stock: { decrement: quantityToBuy },
    version: { increment: 1 },
  },
});

if (updatedProduct.count === 0) {
  throw new ConflictException('Sản phẩm đã được cập nhật bởi giao dịch khác hoặc không đủ tồn kho.');
}
```

## Kiểm thử

| Test | Chứng minh |
|---|---|
| Unit / Integration: Trừ kho chuẩn | Đặt hàng thành công, tồn kho giảm đúng số lượng, `version` tăng 1. |
| Integration: Mua vượt quá tồn kho | Chặn ngay từ bước kiểm tra `stock`, trả về lỗi nghiệp vụ. |
| Concurrency Test (Xung đột đồng thời) | Giả lập nhiều request cùng mua một sản phẩm còn lại 1 cái; chỉ 1 request thành công, các request còn lại nhận lỗi xung đột (409). |

```powershell
npm run test       # Chạy unit test (144 tests passed)
npm run test:e2e   # Chạy integration test trên PostgreSQL
```

## Gợi ý cho thành viên tiếp theo

- **TV5 (Loyalty & Lịch sử đơn hàng):** Khi tích hợp loyalty, lưu ý thực hiện cộng điểm đồng bộ ngay sau khi thanh toán thành công để tránh lệch dữ liệu.
- **TV6 (Demo & Giao diện):** Đảm bảo phía frontend hiển thị thông báo lỗi thân thiện cho khách hàng nếu sản phẩm vừa hết hàng do xung đột đồng thời lúc thanh toán.

## Bàn giao

- Thành viên: TV4 • Task: 10 (Optimistic Locking & Tồn kho) • Nhánh: `feature/tv04`
- Người nhận tiếp: TV5 (Loyalty), TV6 (Demo/UI)
- Vấn đề còn tồn tại: Không có. Toàn bộ cơ chế kiểm soát tồn kho đồng thời đã hoàn thiện và test pass.