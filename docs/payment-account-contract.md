# Contract nội bộ Payment → Account

Base URL từ `ACCOUNT_SERVICE_URL`, mặc định `http://localhost:4003/api`. Cả ba request cần header `X-Account-Service-Token` bằng giá trị `ACCOUNT_SERVICE_TOKEN`. Secret chỉ dành cho caller tin cậy, không cấp cho frontend hay chuyển tiếp qua Gateway. Cấu hình hai khóa JWT và service khác nhau.

| Method và path tương đối | Request | Data khi HTTP 200 |
| --- | --- | --- |
| `GET /accounts/:accountId` | Path `accountId` | `{accountId, fullName, email, phone, balance}` |
| `POST /accounts/deduct` | `{paymentId, accountId, amount}` | `{paymentId, accountId, remainingBalance}` |
| `POST /accounts/refund` | `{paymentId, accountId, amount}` | `{paymentId, accountId, balance}` |

`paymentId` là UUID của Payment, `accountId` là mã tối đa 50 ký tự gồm chữ, số, gạch ngang hoặc gạch dưới. `amount` là JSON integer từ 1 đến 999.999.999.999 VND. Response dùng envelope `{success:true,data}`; lỗi debit/refund nghiệp vụ dùng `{success:false,message,errors:{code}}`.

| HTTP | Mã debit/refund | Ý nghĩa |
| --- | --- | --- |
| 400 | `INVALID_INPUT` | Kiểu dữ liệu, định dạng hoặc giá trị sai |
| 401 | `SERVICE_UNAUTHORIZED` | Thiếu hoặc sai token dịch vụ |
| 402 | `INSUFFICIENT_BALANCE` | Thiếu tiền, kết quả từ chối được lưu theo paymentId |
| 404 | `ACCOUNT_NOT_FOUND`, `DEBIT_NOT_FOUND` | Tài khoản không tồn tại hoặc refund chưa tìm thấy debit |
| 409 | `PAYMENT_CONFLICT` | UUID đã dùng với tài khoản hoặc số tiền khác |
| 409 | `DEBIT_REFUNDED`, `DEBIT_NOT_APPLIED` | Debit đã hoàn hoặc refund một debit chưa trừ tiền |
| 500, timeout hoặc mất kết nối | Kết quả chưa xác định đối với caller | Đối soát bằng retry đúng UUID và đúng payload |

Debit chèn bản ghi với khóa chính `payment_id` và cập nhật có điều kiện `balance >= amount` trong cùng transaction PostgreSQL. Retry đồng thời chờ khóa rồi đọc kết quả đã commit. Khi debit thành công, retry trả lại số dư tại thời điểm debit. Refund khóa bản ghi debit, cộng đúng số tiền đã ghi, lưu số dư sau refund trong cùng transaction. UUID đã refund được giữ lại. Sau 402 hoặc refund, giao dịch mới phải dùng UUID Payment mới. Lỗi cục bộ trước commit rollback cả số dư lẫn bản ghi idempotency.

## Phần Phước cần tích hợp

1. Thêm header xác thực vào cả lookup, deduct và refund trong `account-client.service.ts`, dùng chung token và đặt timeout HTTP hữu hạn. Client hiện có đúng đường dẫn, tên trường, envelope và xử lý HTTP 200, nhưng thiếu header.
2. Xử lý lỗi transport như kết quả chưa rõ. Ghi nhận hoặc truy xuất công việc đối soát bền vững dựa trên `paymentId`. Khi debit mất response, retry cùng UUID và payload để xác định kết quả. Giữ nguyên UUID qua restart và retry. Dùng một worker hoặc khóa theo Payment để tránh quyết định hoàn tất và bù trừ chạy cạnh tranh.
3. Quyết định bù trừ sau khi đọc trạng thái đã commit của Payment. Nếu Payment đã `COMPLETED`, giữ debit. Nếu đã xác định giao dịch thất bại sau debit, gọi refund và lưu kết quả, retry khi chưa xác nhận. Việc refund trước khi một debit đang xử lý commit có thể trả 404; cần chờ kết quả debit rõ ràng trước khi kết thúc đối soát. Đừng xem timeout, rollback cục bộ hoặc lỗi email là bằng chứng để hoàn tiền.
4. Kiểm thử qua Payment thật các ca mất phản hồi sau debit, crash trước và sau commit của Payment, refund bị mất phản hồi và khởi động lại worker. Payment hiện chỉ dùng cờ trong bộ nhớ và bỏ qua kết quả refund, nên phục hồi xuyên service vẫn là phần tích hợp mở. Bảng Payment và OTP cần giữ định danh để đối soát. Thống nhất vòng đời lưu bản ghi debit cùng Payment trước khi dùng DB lâu dài.

## Phần Tài cần tích hợp

Frontend gọi Gateway, gửi Bearer và đăng nhập lại khi nhận 401 do hết hạn. Dùng `/api/accounts/me` để lấy hồ sơ; form thanh toán gửi dữ liệu sinh viên, khoản phí và OTP theo contract TV2. Email OTP được chọn từ hồ sơ server. Nếu tách Notification, kết nối qua cấu hình của Payment và kiểm thử gửi OTP, biên nhận ở môi trường nhóm.
