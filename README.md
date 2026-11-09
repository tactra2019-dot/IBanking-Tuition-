# iBanking Tuition Payment System · TDTU

## Chạy frontend demo

Yêu cầu Node.js 22.12+ hoặc 24 LTS, npm. Trong PowerShell:

```powershell
cd D:\Midterm_SOA\frontend
npm.cmd ci
Copy-Item .env.example .env
npm.cmd run dev
```

Mở [iBanking local](http://127.0.0.1:5173). Một lệnh khởi động Vite cổng 5173 và mock API cổng 3001. Cả hai chỉ bind loopback. Dừng bằng Ctrl+C. Khi muốn reset số dư/học phí demo, dừng và chạy lại lệnh này.

| Dữ liệu demo | Giá trị |
| --- | --- |
| Tên đăng nhập | `tai.demo` |
| Mật khẩu | `Demo@123` |
| OTP mô phỏng | `123456` |
| MSSV thanh toán thành công | `52200001` |
| Học phí đã thanh toán | `52200002` |
| Không đủ số dư | `52200003` |
| Giữ trạng thái PROCESSING | `52200004` |
| Giao dịch FAILED sau OTP | `52200005` |
| Chưa có khoản học phí | `52200006` |
| MSSV không tồn tại | `99999999` |

Mock lưu dữ liệu trong RAM, không gửi email và không chuyển tiền. OTP demo được kiểm tra ở Node mock server, không xác thực ở React. PROCESSING giữ nguyên để minh họa trạng thái chưa có kết quả cuối cùng; không có bộ hẹn giờ tự đổi thành thành công.

## Màn hình và kiến trúc

- `/login`: form React Hook Form + Zod, hiện/ẩn mật khẩu, chỉ ghi nhớ username khi được chọn.
- `/dashboard`: chủ tài khoản, số dư, trạng thái tài khoản, giao dịch và thao tác nhanh.
- `/payment`: thông tin người trả tiền chỉ đọc, MSSV, học phí toàn bộ, điều kiện thanh toán, modal xác nhận.
- `/payment/:paymentId/otp`: sáu ô nhập OTP, dán mã, đếm ngược theo `expiresAt`, gửi lại có giới hạn, khóa submit.
- `/payment/:paymentId/result`: chỉ xác nhận thành công với `SUCCESS`; polling 5 giây cho `PENDING`/`PROCESSING`.
- `/transactions`: bộ lọc trạng thái, phân trang và xem chi tiết/tiếp tục OTP.
- `/account`: thông tin chủ tài khoản độc lập với thông tin sinh viên.

React 19 + TypeScript + Vite, Tailwind CSS 4, Router, Axios, TanStack Query, React Hook Form, Zod, Lucide, Sonner. Font Be Vietnam Pro được đóng gói local. Illustration SVG tự dựng theo chủ đề ảnh mẫu, không dùng ảnh chụp giao diện làm nội dung trang.

```text
frontend/
  mock/                 HTTP API mô phỏng và domain tests
  scripts/dev.mjs        Khởi động/dừng Vite và mock cùng nhau
  src/
    app/                Auth context (token trong RAM)
    components/         UI, layout, minh họa và payment components
    hooks/              Query hooks
    pages/              Các màn hình
    routes/             Protected routes
    services/           Axios và adapter theo service
    styles/             Theme, responsive, focus, reduced motion
    types/, utils/      DTO và định dạng
notification-service/   Spring Boot Web + Mail + Validation
docs/                   Contract, demo, kiểm thử và ảnh QA
```

Reload trang sẽ yêu cầu đăng nhập lại vì access token chỉ nằm trong bộ nhớ; dữ liệu giao dịch vẫn tồn tại ở mock server đến khi server restart. Mở lịch sử để tiếp tục giao dịch chờ OTP. Không lưu password, OTP hoặc access token vào localStorage/sessionStorage.

## Chuyển sang API thật

Đọc [API contract đề xuất](docs/API-CONTRACT.md) và thống nhất với Thành/Phước trước. Các endpoint hiện tại là **đề xuất**, chưa phải API đã được backend xác nhận. Sửa adapter theo contract thật rồi cấu hình `frontend/.env`:

```dotenv
VITE_DEMO_MODE=false
VITE_API_BASE_URL=http://localhost:8080
VITE_API_CONTRACT_CONFIRMED=true
```

Chạy `npm.cmd run dev:ui`. Gateway phải cho phép origin frontend, header Authorization/Idempotency-Key và preflight. Bản đề xuất dùng bearer token trong RAM; nếu nhóm dùng cookie HttpOnly cần thay adapter, cấu hình credentials/CSRF theo contract đã chốt. Frontend không gọi Notification Service.

## Notification Service và email local

Yêu cầu **JDK 17–25**, Docker cho Mailpit. Maven Wrapper được cung cấp; hoặc dùng Maven 3.9.9 đã có. Java mặc định trên máy hiện tại trỏ tới bản cũ, nên cần chỉ định JDK hợp lệ. JDK 25 của Android Studio đã được dùng để kiểm thử:

```powershell
cd D:\Midterm_SOA\notification-service
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
docker compose up -d mailpit
# Khóa ngẫu nhiên chỉ tồn tại trong phiên PowerShell này; không đưa vào VITE_*.
$env:NOTIFICATION_INTERNAL_KEY = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
.\mvnw.cmd spring-boot:run
```

Nếu wrapper không tải được Maven do kết nối mạng, dùng Maven đã cài hoặc bản portable có sẵn sau phiên triển khai này:

```powershell
& '..\.tools\apache-maven-3.9.9\bin\mvn.cmd' '-Dmaven.repo.local=D:\Midterm_SOA\.tools\m2' spring-boot:run
```

Service mặc định ở `127.0.0.1:8085`; xem thư bắt được tại [Mailpit](http://127.0.0.1:8025). Mailpit không chuyển thư ra ngoài. `.env.example` chỉ là tài liệu biến môi trường; Spring Boot không tự nạp file `.env`. Với SMTP thật, đặt `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_AUTH=true`, `SMTP_STARTTLS=true`, `MAIL_FROM` trong process environment. Không ghi credentials vào source.

Endpoint nội bộ yêu cầu `X-Internal-Key`, chỉ dành cho Payment Service. Service từ chối khởi động nếu thiếu khóa dài tối thiểu 32 ký tự. OTP chỉ được gửi khi còn hạn và tối đa 5 phút; success email chỉ nhận `status=SUCCESS`. Template tiếng Việt escape nội dung động; không log OTP/body. Xem [contract](docs/API-CONTRACT.md#notification-service--tv3) và [kịch bản demo](docs/DEMO.md).

## Build và test

```powershell
cd D:\Midterm_SOA\frontend
npm.cmd run build
npm.cmd test

cd D:\Midterm_SOA\notification-service
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
.\mvnw.cmd verify
```

Kết quả thực tế và giới hạn được ghi tại [VERIFICATION.md](docs/VERIFICATION.md). Test Java dựng một SMTP server loopback trong bộ nhớ, kiểm tra email thật qua giao thức SMTP mà không cần Mailpit/Docker. Các test không gửi thư ra Internet.

## Phạm vi bàn giao và giới hạn

- Không có backend TV1/TV2 trong workspace; chưa kiểm thử tích hợp với gateway/JWT/database thật.
- Không tạo biên lai vì chưa có API/dữ liệu chứng từ được backend xác nhận.
- Notification deduplicate theo eventId trong RAM 24 giờ, tối đa 10.000 bản ghi; không bảo đảm exactly-once qua restart, nhiều instance hoặc timeout SMTP sau khi máy chủ đã nhận thư. Khi triển khai thật, thống nhất outbox/durable dedup với TV2.
- Không có OTP/token/credentials thật trong source. Tài khoản và OTP cố định chỉ là fixture demo/test.
- [Danh sách file bàn giao](docs/DELIVERY.md). Không thực hiện Git init, commit, push hoặc merge.

Tham chiếu cấu hình: [Tailwind với Vite](https://tailwindcss.com/docs/installation/using-vite), [yêu cầu Java của Spring Boot 3.5](https://docs.spring.io/spring-boot/3.5/system-requirements.html).
