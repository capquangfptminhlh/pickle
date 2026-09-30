# Thiết kế sửa từng vận động viên

## Mục tiêu

Trang **VĐV & cặp đấu** phải hiển thị nút **Sửa** cố định trên từng dòng vận động viên. Người có quyền có thể cập nhật thông tin của đúng vận động viên và đúng phạm vi được server cho phép.

## Giao diện

- Cột cuối của bảng có tiêu đề **Thao tác**.
- Mỗi dòng hiển thị nút **Sửa** ngay khi bảng được render; nút không còn phụ thuộc vào bước chèn động sau render.
- Nút **Sửa** mở modal theo kiểu giao diện hiện tại.
- Admin và Chủ giải thấy các trường: họ tên, biệt danh, giới tính, CLB, điện thoại, rating, lý do đổi rating và trạng thái hoạt động.
- Quản lý CLB chỉ sửa được VĐV thuộc CLB của mình và không được đổi CLB hoặc rating.
- Trọng tài chỉ sửa thông tin cơ bản của VĐV thuộc trận được phân công; các trường điện thoại, CLB, rating và trạng thái không xuất hiện.
- Avatar tiếp tục dùng thao tác riêng vì R2 chưa được kích hoạt.

## Luồng lưu dữ liệu

1. Giao diện kiểm tra họ tên không rỗng.
2. Nếu Admin hoặc Chủ giải thay đổi rating, giao diện yêu cầu nhập lý do.
3. Giao diện gửi một yêu cầu cập nhật VĐV.
4. Backend kiểm tra phiên đăng nhập, vai trò và phạm vi VĐV.
5. Backend cập nhật hồ sơ, gồm cả `club_id` cho vai trò được phép.
6. Nếu rating thay đổi, backend cập nhật rating và thêm một bản ghi `rating_history` trong cùng một D1 batch.
7. Backend ghi audit, trả hồ sơ mới; giao diện đóng modal, tải lại bảng và báo thành công.

## Quy tắc và lỗi

- Họ tên sau khi bỏ khoảng trắng không được rỗng.
- Giới tính chỉ nhận giá trị đang được hệ thống hỗ trợ.
- CLB mới phải tồn tại và đang hoạt động.
- Rating phải là số hữu hạn, không âm; thay đổi rating phải có lý do.
- Server bỏ qua hoặc từ chối các trường vượt quyền, không dựa vào việc giao diện có ẩn trường hay không.
- Khi D1 batch lỗi, thay đổi hồ sơ và lịch sử rating cùng thất bại để tránh dữ liệu lệch nhau.
- Lỗi được hiển thị trong toast hiện có; modal giữ nguyên để người dùng sửa lại.

## Thay đổi kỹ thuật

- Render nút **Sửa** trực tiếp trong `assets/admin-app.js`.
- Dùng lại modal trong `assets/admin-crud.js`, mở rộng thêm rating và lý do theo vai trò.
- Mở rộng `PATCH /api/players/:id` trong `cloudflare/src/index.js` để cập nhật `club_id` và ghi lịch sử rating nguyên tử.
- Giữ `POST /api/players/:id/rating-adjust` để tương thích với thao tác điều chỉnh rating hiện tại.
- Tăng phiên bản asset trong `admin.html` để trình duyệt tải mã mới sau deploy.

## Kiểm thử và nghiệm thu

- Kiểm thử backend cho Admin/Chủ giải cập nhật đầy đủ, gồm đổi CLB và rating có lịch sử.
- Kiểm thử Quản lý CLB và Trọng tài không thể thay đổi trường vượt quyền.
- Kiểm thử dữ liệu không hợp lệ và thiếu lý do rating.
- Chạy test Cloudflare, build asset và dry-run deploy.
- Sau deploy, đăng nhập production và xác nhận trang quản trị, API health và asset mới hoạt động.

Hoàn thành khi nút **Sửa** luôn xuất hiện trên từng dòng VĐV, dữ liệu được cập nhật đúng quyền, và thay đổi rating luôn có lịch sử.
