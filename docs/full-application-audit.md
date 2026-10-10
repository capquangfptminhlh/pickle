# Kiểm tra vận hành ứng dụng — 10/10/2026

Đợt này bổ sung kiểm tra luồng hoàn chỉnh bằng giao diện thật và Worker thật với SQLite riêng. Số lượng unit test không được dùng để kết luận mọi thao tác trên ứng dụng đều hoạt động.

## Lỗi tái hiện và sửa

1. Nút chia bảng chính chọn nội dung đầu tiên dù nội dung đó không có đội. Nay bỏ qua nội dung chưa đủ đội; khi nhiều nội dung đủ đội, BTC chọn rõ nội dung trước khi thiết lập. Chỉ liệt kê nội dung thuộc giải đang mở.
2. Chốt hết vòng bảng đã chuyển giải vào lịch sử trước khi tạo knockout. Nay các nội dung knockout phải hoàn tất chung kết; nội dung vòng tròn không cần chung kết. Nội dung khác có đội nhưng chưa thi đấu vẫn giữ giải đang vận hành. Nhận diện chung kết loại kép của cả Worker và PostgreSQL/preview, không nhận nhầm chung kết nhánh thắng.
3. Double click hoặc thử lại khi tạo sân thất bại tạo thêm giải. Nay khóa thao tác đang lưu, giữ mã giải đã tạo và đối chiếu sân đã lưu trước khi thử lại, kể cả trường hợp phản hồi tạo sân bị mất sau khi server đã lưu.
4. BTC không có đường sửa luật nội dung đã tạo từ trung tâm giải. Nay có nút **Luật thi đấu** dùng editor hiện có. Quyền và khóa đổi luật sau khi trận bắt đầu vẫn do backend kiểm tra.

## Bằng chứng tại bản sửa

| Phạm vi | Kiểm tra | Giới hạn |
| --- | --- | --- |
| Vận hành giải từ đầu đến cuối | 4 giải qua đăng nhập BTC, tạo giải, cấu hình nội dung, tạo hồ sơ VĐV, chọn đội, đăng ký, chia bảng, tạo trọng tài, đăng nhập trọng tài bằng form, phân công bằng UI, ghi điểm, chốt vòng bảng, tạo bracket, chung kết, nhà vô địch công khai | Worker + SQLite riêng; hồ sơ VĐV đầu tiên tạo qua UI, các hồ sơ còn lại tạo bằng API thật |
| Luật thi đấu trong luồng hoàn chỉnh | Đơn chạm 11; đôi chạm 15; MLP 3 người chạy điểm 27, kiểm tra AB → BC → CA; Best of 3; chạm điểm nhưng chưa cách 2 không cho chốt | 4 đội mỗi nội dung; 20 trận tổng, không phải giải production 48 VĐV |
| Các màn hình theo quyền | 102 lượt mở trang, 5 quyền: super admin, BTC, trọng tài, quản lý CLB, thu ngân; 1440px và 375px; kiểm tra lỗi JS và API không thành công | Kiểm tra mở trang; không phải mọi thao tác CRUD trên từng trang |
| Lỗi kết nối và cập nhật điểm | Phản hồi cũ đến sau, mất phản hồi đã ghi điểm, offline trước ghi điểm, tài khoản bị khóa khi đang nhập | Fixture backend thật; thông báo realtime được kích hoạt trong harness |
| Khôi phục tạo giải, chỉnh luật, chọn nội dung, tiến độ | Các regression có ca đỏ trước sửa, ca xanh sau sửa; cả desktop/mobile | Không chứng minh mọi biến thể mạng hoặc trình duyệt |
| Backend | 1.146 test Worker chạy lại thành công | Unit/integration API; không phải 1.146 lượt thao tác UI |
| Bản build | Build assets và Wrangler deploy dry-run thành công | Dry-run không phải xác nhận đã triển khai |

Realtime và service worker không chạy trong harness lifecycle/role-pages. Các bộ realtime/PWA riêng tiếp tục nằm trong CI. Hai pipeline chạy toàn bộ regression hiện có, PostgreSQL integration và Worker D1 smoke trước khi chốt triển khai.

## Chạy lại

```powershell
node scripts/registry-lifecycle-ui.mjs
node scripts/registry-role-pages-ui.mjs
node --test scripts/registry-tournament-progress.test.mjs scripts/registry-tournament-recovery-ui.mjs scripts/registry-draw-ui.test.mjs scripts/registry-network-ui.test.mjs scripts/registry-api-client.test.mjs
node scripts/registry-operator-center-ui.mjs
```

Trong `cloudflare/`: `npm test` và `npm run check`.

CI đã bổ sung lifecycle, role-pages và recovery/progress để lỗi tương tự không bị bỏ qua chỉ vì các bài test đơn lẻ đều xanh.

## Kiểm tra production

Sau triển khai, kiểm tra chỉ đọc: đối chiếu SHA của JavaScript/service worker, health, chặn API quản trị khi chưa đăng nhập, các trang công khai trên desktop/mobile, tài nguyên bị thiếu, hình hỏng, lỗi JS và tràn chiều ngang. Bằng chứng được lưu ngoài repository trong `outputs/full-audit/production-verification.json`.

Không tạo tài khoản, chia lại bảng hoặc ghi điểm thử trên giải thật. Chưa có kiểm tra đầy đủ với phiên tài khoản production đang đăng nhập của người dùng; luồng ghi dữ liệu đầy đủ nêu trên chạy trong môi trường riêng. Kết quả này không phải lời bảo đảm toàn bộ ứng dụng không còn lỗi.
