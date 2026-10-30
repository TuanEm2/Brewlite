# Sprint 3 — Task 10: Order State Machine (TV3)

## User Story / Goal

Là cửa hàng, tôi muốn đơn hàng chỉ đi theo đúng quy trình (đặt → trả tiền → pha → xong → giao), để không có đơn "đang pha" khi chưa trả tiền hay đơn đã giao lại bị hủy. Đây là nghiệp vụ 1/4 của Task 10.

## Acceptance Criteria (theo tài liệu BrewLite, mục 9 và 9.1)

- [x] Luồng chính `PENDING → PAID → PREPARING → READY → COMPLETED`.
- [x] Hàm `assertTransition` chặn mọi chuyển tiếp không có mũi tên trong sơ đồ (ném lỗi 409).
- [x] `COMPLETED`, `CANCELLED` là trạng thái kết thúc.
- [x] Mọi thay đổi trạng thái đi qua máy trạng thái, kể cả code thanh toán của TV1 (đã refactor).
- [x] Tiêu chí chấm (a): unit/integration test chứng minh chặn được chuyển trạng thái sai.
- [x] Đã chạy `npm run typecheck`, `npm run test` (143), `npm run test:e2e` (49), `npm run build` (24/10/2026).

## Sơ đồ (mục 9.1 của đề)

```text
start → PENDING ──thanh toán OK──▶ PAID ──barista nhận──▶ PREPARING ──pha xong──▶ READY ──giao khách──▶ COMPLETED
          │  ▲                       │
 thanh toán│  │thử lại               │hủy
      lỗi  ▼  │                      ▼
     PAYMENT_FAILED ────hủy────▶ CANCELLED ◀──hủy── PENDING
```

| Từ | Được sang |
|---|---|
| `PENDING` | `PAID`, `PAYMENT_FAILED`, `CANCELLED` |
| `PAYMENT_FAILED` | `PENDING` (thử lại), `CANCELLED` |
| `PAID` | `PREPARING`, `CANCELLED` |
| `PREPARING` | `READY` |
| `READY` | `COMPLETED` |
| `COMPLETED`, `CANCELLED` | (kết thúc) |

## Code

| File | Nội dung |
|---|---|
| `backend/src/orders/order-state.ts` | `ORDER_TRANSITIONS`, `canTransition`, `isTerminal`, `assertTransition`, `InvalidOrderTransitionException` (409), `paymentTransitionPath` |
| `backend/src/orders/orders.service.ts` | `changeStatus(orderId, to)`: đổi trạng thái ngoài thanh toán (PREPARING, READY, COMPLETED, CANCELLED) |
| `backend/src/payments/payments.service.ts` | (code TV1) thay các `if` kiểm tra tay và 2 chỗ gán `status` trực tiếp bằng `paymentTransitionPath` |
| `backend/src/orders/order-state.spec.ts` | 67 unit test, gồm đủ 49 cặp trạng thái |
| `backend/test/order-state.e2e-spec.ts` | 11 integration test trên PostgreSQL |

### Quy tắc nghiệp vụ

- **Thanh toán** (`PaymentsService`, TV1): đơn `PENDING` sang `PAID`/`PAYMENT_FAILED`. Đơn `PAYMENT_FAILED` phải **thử lại về `PENDING`** rồi mới tới đích (sơ đồ không có mũi tên `PAYMENT_FAILED → PAID`). Hai bước nằm trong cùng transaction đang khóa `FOR UPDATE`, nên chỉ ghi trạng thái đích; khách vẫn thử lại được như trước. Đơn ở trạng thái khác (`CANCELLED`, `PREPARING`…) → 409.
- **`changeStatus`**: không được đặt `PENDING`, `PAID`, `PAYMENT_FAILED` (400). Ba trạng thái này chỉ thanh toán mới được ghi, để không thể đánh dấu "đã trả tiền" mà không thanh toán.
- **Chống ghi đè đồng thời**: `changeStatus` cập nhật có điều kiện `WHERE id = ? AND status = <trạng thái vừa đọc>`. Hai yêu cầu cùng lúc (ví dụ "nhận pha" và "hủy") chỉ một yêu cầu thành công, yêu cầu còn lại nhận 409.

### Ví dụ

```ts
await ordersService.changeStatus(orderId, OrderStatus.PREPARING); // PAID → PREPARING
await ordersService.changeStatus(orderId, OrderStatus.CANCELLED); // PREPARING → CANCELLED: 409
assertTransition(OrderStatus.COMPLETED, OrderStatus.CANCELLED);   // ném InvalidOrderTransitionException
```

## Kiểm thử

| Test | Chứng minh |
|---|---|
| Unit: 9 cặp có mũi tên | đều được phép |
| Unit: 40 cặp còn lại | đều bị `assertTransition` chặn (409) |
| Unit: các ca điển hình | `PENDING → PREPARING`, `PAYMENT_FAILED → PAID`, `COMPLETED → CANCELLED`… bị chặn |
| Integration: luồng chính | đơn thật đi `PENDING → PAID → PREPARING → READY → COMPLETED` |
| Integration: thanh toán lỗi rồi thử lại | `PAYMENT_FAILED` → thử lại → `PAID` |
| Integration: chuyển sai | 409, trạng thái trong CSDL giữ nguyên |
| Integration: đơn đã hủy | không thanh toán được, không tạo `Payment` |
| Integration: đồng thời | 2 yêu cầu đổi trạng thái cùng lúc chỉ 1 thành công |
| Test sẵn có của TV1 (`payments.service.spec.ts`) | vẫn đạt sau refactor |

```powershell
npm run test       # unit, không cần CSDL
npm run test:e2e   # integration, cần PostgreSQL và JWT_SECRET trong backend/.env
```

## Gợi ý cho thành viên tiếp theo

- **TV4 (Task 10 – tồn kho):** trừ kho trong cùng transaction với tạo đơn hoặc thanh toán; nếu cần hủy đơn để trả kho, gọi `changeStatus(id, CANCELLED)` rồi cộng lại kho.
- **TV5 (Task 10 – loyalty, Task 9 – lịch sử):** cộng điểm **chỉ khi đơn vừa sang `PAID`** (trong `PaymentsService`, ngay sau khi ghi `PAID`). Khi thêm `GET /orders/me`, khai báo `@Get('me')` **trước** `@Get(':id')` trong `OrdersController`, nếu không route `:id` bắt chữ "me" và trả 400.
- **TV6 (demo):** sơ đồ coi barista cập nhật trạng thái là phần mở rộng ngoài MVP, nên chưa có endpoint. Muốn demo `PREPARING → READY → COMPLETED` thì thêm route gọi `OrdersService.changeStatus`.
- **TV6 (giỏ hàng):** trang `/cart` đang gọi `clearCart()` ngay khi tạo đơn `PENDING`; theo US-05 chỉ nên xóa giỏ sau khi thanh toán thành công.

## Bàn giao

- Thành viên: TV3 • Task: 10 (Order State Machine) • Nhánh: `feature/tv03` (đã merge `feature/tv02` commit `ae1f3f2`)
- Người nhận tiếp: TV4 (tồn kho), TV5 (loyalty)
- Vấn đề còn tồn tại: chưa có endpoint đổi trạng thái (ngoài MVP); tồn kho và loyalty thuộc TV4, TV5.
