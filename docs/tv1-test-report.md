# Kết quả kiểm thử TV1

Kiểm thử ngày 09/11/2026 trên PostgreSQL 16 do Docker Compose khởi động, schema riêng `tv1_verify_20261109`. Test chạy qua HTTP thật và dùng các bảng PostgreSQL thật. Bộ hồi quy TV2 dùng Mock Account theo cấu hình của test hiện có.

| Hạng mục | Kết quả | Quan sát |
| --- | --- | --- |
| Cài dependencies và sinh Prisma Client | PASS | `npm ci` và `npm run db:generate` hoàn tất. npm báo 4 lỗ hổng mức cao từ bộ dependency hiện có. |
| Docker Compose, build và đồng bộ schema | PASS | Compose hợp lệ, PostgreSQL healthy, TypeScript sinh JS. Chạy lại `db:push` báo schema đã đồng bộ. |
| SQL và seed | PASS | `db:account` chạy lại được. Seed Account chạy hai lần trên schema thử. |
| Hash mật khẩu | PASS | Cùng mật khẩu cho hash khác nhau, kiểm tra đúng và sai. |
| Đăng nhập và JWT | PASS | Login đúng, sai username, sai password, JWT hợp lệ, thiếu token, hết hạn, sửa chữ ký. |
| Gateway và quyền sở hữu | PASS | Client không giả danh user qua header. Chặn đọc và xác nhận OTP giao dịch của người khác. Chặn debit nội bộ và ghi học phí trực tiếp từ Gateway. Định tuyến đến Student và Payment. |
| Lịch sử | PASS | Trả bản ghi Payment thật của user và loại bản ghi thuộc tài khoản khác. |
| Hai debit đồng thời | PASS | Hai lệnh 7.000.000 VND trên số dư 10.000.000 VND nhận HTTP 200 và 402. Số dư cuối 3.000.000 VND. |
| Retry và xung đột | PASS | Sáu request cùng UUID chỉ trừ một lần. Đổi số tiền hoặc tài khoản nhận 409. Hai refund đồng thời chỉ hoàn một lần. |
| Thiếu số dư | PASS | Debit và retry đều trả 402. Số dư giữ nguyên. |
| Lỗi sau UPDATE | PASS | Rollback số dư và bản ghi debit. Retry cùng UUID thành công. |
| Ràng buộc PostgreSQL | PASS | UPDATE trực tiếp về số âm bị CHECK từ chối. |
| Swagger và Postman | PASS | Hai Swagger UI và JSON trả HTTP 200. File Postman đọc được dưới dạng JSON. |
| Hồi quy `npm test` | PASS | Student, Payment/OTP, Swagger và ba nhóm concurrency của TV2 chạy thành công với Mock Account. |
| Payment hiện tại gọi Account thật | PASS | Tái hiện lỗi tích hợp dự kiến. Gateway gọi Payment, Account trả 401 vì thiếu token nội bộ, và không có payment mới. |
| Thanh toán và phục hồi xuyên service qua Account thật | NOT RUN | Chờ Phước thêm header, đối soát và xử lý retry bền vững theo contract. |
| React và giao email qua Notification | NOT RUN | Không có app React hoặc Notification độc lập trên branch kiểm thử. |

Bộ `test:core` với `RUN_CORE_DB_TESTS=1` đạt **11/11**. Lệnh chạy lại và cách demo nằm trong [hướng dẫn TV1](tv1.md). Các tình huống phục hồi xuyên service nằm trong [contract Payment–Account](payment-account-contract.md).
