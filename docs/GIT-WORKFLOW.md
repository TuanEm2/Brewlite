# Quy trình GitHub nhóm 6 thành viên

## Nhánh

| Thành viên | Nhánh làm việc | Nhận code từ |
|---|---|---|
| TV1 | `feature/tv01` | `main` lần đầu, `feature/tv06` từ Sprint 2 |
| TV2 | `feature/tv02` | `feature/tv01` |
| TV3 | `feature/tv03` | `feature/tv02` |
| TV4 | `feature/tv04` | `feature/tv03` |
| TV5 | `feature/tv05` | `feature/tv04` |
| TV6 | `feature/tv06` | `feature/tv05` |

## Lần đầu nhận bàn giao (ví dụ TV2)

```bash
git clone https://github.com/USERNAME/BrewLite.git
cd BrewLite
git fetch origin
git switch -c feature/tv02 origin/feature/tv01
npm ci
```

Lệnh `npm ci` cần file `package-lock.json` do TV1 đã commit. Nếu chưa có lockfile, phải yêu cầu TV1 bổ sung trước.

## Sang lượt làm tiếp theo

Ví dụ TV2 đã có nhánh riêng và TV1 vừa push lượt kế tiếp:

```bash
git switch feature/tv02
git status    # bảo đảm không có thay đổi chưa commit
git fetch origin
git merge origin/feature/tv01
```

Nếu xuất hiện conflict, giải quyết, kiểm thử lại rồi commit merge. Sau đó mới viết tính năng TV2.

## Kết thúc lượt

```bash
npm run typecheck
npm run test
git add .
git commit -m "feat(scope): describe real change"
git push -u origin feature/tv02
```

## Cuối Sprint 3

Sau TV6 push bản tích hợp cuối cùng, nhóm trưởng kiểm thử và merge vào `main` thông qua Pull Request; không cherry-pick tùy tiện và không squash hết commit nếu cần giữ rõ lịch sử người đóng góp. Các PR nhánh kế thừa có thể chứa commit người trước, nên nhóm trưởng cần review phần mới của từng nhánh.

**Cảnh báo:** Đây là quy trình phát triển **tuần tự theo yêu cầu nhóm**, không phải mô hình nhánh song song thường gặp. Người sau chỉ làm trên code đã nhận, vì vậy mọi lỗi hoặc chậm trễ đều có thể ảnh hưởng toàn chuỗi; thông báo sớm trong nhóm nếu bị chặn.
