# Xếp lịch giải pickleball 6 sân: tránh trùng VĐV và xung đột điều phối

> **BẢN THẢO CHỜ DUYỆT — KHÔNG XUẤT BẢN / KHÔNG INDEX.** Ngày soạn: 2026-11-21. URL canonical: CHƯA PHÂN BỔ. Nội dung này chỉ dùng làm nguồn cho bài viết khi có template, K0 và phê duyệt.

**SEO title dự kiến:** Cách xếp lịch thi đấu pickleball 6 sân không trùng VĐV  
**Meta description dự kiến:** Quy trình xếp lịch giải pickleball 6 sân: tránh trùng sân, trùng vận động viên, kiểm tra thời gian nghỉ và xử lý hai người điều phối cùng sửa lịch.  
**Primary intent:** Hướng dẫn BTC tổ chức giải, không phải trang lịch giải đang diễn ra.  
**Canonical owner:** UNASSIGNED / HOLD; không tạo đường dẫn /blog/ giả định.  
**Ảnh gốc dự kiến:** `docs/seo-assets/six-court-scheduling-diagram.svg` (chưa phải public URL).

## Nguyên tắc lập lịch trước ngày thi đấu

Với sáu sân, số sân trống không đồng nghĩa có thể xếp ngay một trận: cùng một vận động viên có thể đăng ký nhiều nội dung, thời gian nghỉ do điều lệ giải quy định và lịch có thể bị hai điều phối viên sửa đồng thời. BTC nên kiểm tra cả **sân, VĐV, thời gian nghỉ và phiên bản lịch** trước khi xác nhận.

### 1. Chuẩn bị dữ liệu đầu vào

Ghi rõ mã trận, nội dung, danh sách VĐV, thời lượng dự kiến, sân khả dụng và trạng thái trận. Trận đã bắt đầu không nên được chuyển sân/giờ tùy tiện; nếu cần thay đổi, áp dụng quy trình có người chịu trách nhiệm và lịch sử thao tác.

### 2. Kiểm tra trùng sân và trùng VĐV

Hai trận không được chiếm cùng một sân trong các khoảng thời gian giao nhau. Hai trận ở hai sân khác nhau cũng không được xếp cùng lúc nếu có chung VĐV, kể cả khi họ thi đấu ở hai nội dung. Với một trận dự kiến 09:00–09:20, trận tiếp theo ở sân đó bắt đầu lúc 09:19 là xung đột; bắt đầu đúng 09:20 chỉ hết xung đột **sân**, vẫn phải kiểm tra VĐV và thời gian nghỉ.

### 3. Thiết lập thời gian nghỉ theo điều lệ giải

Ví dụ, BTC chọn khoảng nghỉ tối thiểu **35 phút** cho một giải cụ thể: VĐV vừa kết thúc lúc 09:20 thì không nên bắt đầu trận kế tiếp trước 09:55. Con số này chỉ là **ví dụ cấu hình vận hành**, không phải quy định pickleball chính thức áp dụng cho mọi giải. Ghi rõ quy tắc nghỉ trước khi mở lịch cho trọng tài.

### 4. Chống ghi đè khi có nhiều BTC

Nếu điều phối viên A đã đổi sân/giờ, điều phối viên B đang xem bản lịch cũ cần được yêu cầu tải lại thay vì ghi đè. Khi máy chủ trả về xung đột, không tạo trận một phần và không ghi lịch sử xác nhận thành công giả. Mọi thao tác chuyển sân/giờ cần hiển thị xác nhận rõ ràng.

### 5. Checklist 15 phút trước khi bắt đầu

- Đối chiếu danh sách trận chưa xếp và trận đã có sân.
- Rà lại VĐV tham gia nhiều nội dung và khoảng nghỉ.
- Kiểm tra lịch sáu sân, đặc biệt các mốc sát nhau.
- Chỉ định người duyệt đổi sân, trọng tài nhập điểm và người xử lý khiếu nại.
- Kiểm thử một tình huống mạng yếu/mất kết nối, bảo đảm không nhập điểm hai lần.
- Công bố lịch cuối cùng và cách thông báo khi lịch thay đổi.

## Câu hỏi thường gặp

**Sáu sân trống có nghĩa là xếp được sáu trận bất kỳ?** Không. Cần kiểm tra trùng VĐV, thời gian nghỉ, tình trạng trận và phân quyền điều phối.

**Có thể xếp trận mới đúng thời điểm trận trước kết thúc?** Có thể về mặt sử dụng sân nếu không chồng khoảng thời gian, nhưng còn phụ thuộc VĐV, nghỉ và quy định của BTC.

**Hai người cùng đổi lịch thì xử lý thế nào?** Máy chủ cần kiểm tra phiên bản lịch, từ chối thao tác dùng phiên bản cũ và yêu cầu người thao tác xem lại thay đổi mới nhất.

## Liên kết nội bộ dự kiến (cần xác minh live)

- Trang chủ PickleUp: `/` — giới thiệu quản lý giải.
- Trang giải đấu: `/tournament` — chỉ liên kết nếu URL thực tế trả HTTP 200 và phù hợp ý định.
- Không liên kết trực tiếp trang admin/noindex như nội dung công khai.

## Nguồn và phạm vi xác minh

- Mô hình vận hành và tình huống 6 sân: yêu cầu Issue #48 và các regression test PR #60/#62/#63/#64/#66 trong chính repo PickleUp, đọc ngày 2026-11-21. Đây là bằng chứng hành vi phần mềm, **không phải** quy định thi đấu chính thức.
- Không trích dẫn luật giao bóng, tính điểm hay tuyên bố luật chính thức khi chưa đối chiếu văn bản quy định hiện hành từ tổ chức có thẩm quyền.

**Gate chưa đạt:** kiểm tra bài hiện có/live, SERP/K0, canonical owner, template, ảnh render 390px, engine, CI trên commit mới, hai human reviewers và owner approval. Chỉ chuyển bài này vào website sau khi toàn bộ gate áp dụng PASS.
