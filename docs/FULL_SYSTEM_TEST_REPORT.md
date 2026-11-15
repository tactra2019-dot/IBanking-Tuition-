# FULL SYSTEM TEST REPORT

Ngày kiểm thử: 2026-11-15. Trạng thái áp dụng cho nhánh `fix/microservices-architecture`, commit `c6b4f2e1f56857f6e6dace358749c87e9bdb64d9`.

## 1. Phạm vi và môi trường

- Repo QA là worktree riêng của `D:\Midterm_SOA`. Checkout tích hợp trước đó và các thay đổi đã stage không bị sửa. Không commit, push, merge, rebase hoặc reset.
- Schema test mới: `micro_test_qa_20261115` trong PostgreSQL container riêng, port 5434. Dữ liệu demo cũ ở port 5433 không bị thay đổi.
- Node.js 24.14.1, npm 11.11.0, Docker Compose v5.5.1, PostgreSQL 16, JDK 25.0.2, Maven 3.9.9.
- Stack thật: Auth, Account, Student, Payment và Gateway là Node.js/Express/TypeScript; Notification là Spring Boot; frontend là React/TypeScript/Vite. Bốn service dữ liệu dùng PostgreSQL role riêng. Gateway không có DB connection.
- Khóa và mật khẩu test được tạo ngẫu nhiên trong `.env` đã ignore. `frontend/.env`, `.env.micro-roles.local` và `.env.compose.local` cũng được ignore. Mail chỉ tới Mailpit local; không dùng tài khoản hay email cá nhân.

## 2. Service đang chạy

| Service | Port host | Kết quả | Bằng chứng |
| --- | --- | --- | --- |
| React/Vite | 127.0.0.1:5173 | PASS | HTTP 200, real API mode |
| API Gateway | 127.0.0.1:4010 → 4000 | PASS | Compose healthy, `/health` trả `api-gateway:ok`, API smoke đạt |
| Auth | nội bộ 4004 | PASS | Compose healthy, login thật qua Gateway |
| Account | nội bộ 4003 | PASS | Compose healthy, balance/history/debit thật |
| Student | nội bộ 4001 | PASS | Compose healthy, lookup/tuition thật |
| Payment | nội bộ 4002 | PASS | Compose healthy, intent/OTP/payment thật |
| Notification | 127.0.0.1:8086 → 8085 | PASS | Compose healthy, `/health` trả `notification-service:ok` |
| PostgreSQL | 127.0.0.1:5434 → 5432 | PASS | Compose healthy, query schema trực tiếp |
| Mailpit | UI 8026, SMTP 1026 | PASS | Compose healthy, OTP và biên nhận đã nhận |

## 3. Database và cấu hình

- PASS: `db:push -- --skip-generate`, `db:account`, `db:recovery` trên schema test mới; bảy bảng `users`, `accounts`, `students`, `tuition_fees`, `payments`, `otp_codes`, `account_debits` có mặt.
- PASS: chỉ mục `idx_unique_completed_payment_per_tuition` có mặt; `db:roles` cấp bốn role theo bảng. `test:processes` xác nhận role đọc bảng sở hữu và bị từ chối trên bảng service khác.
- PASS: seed demo tạo 2 user/account và 3 student/tuition fee. Trước demo smoke: `demo1` đăng nhập được, số dư 50.000.000 VND, `521H9001` còn UNPAID với học phí 7.000.000 VND.
- Cấu hình local dùng Gateway port 4010, Notification 8086, Mailpit 8026 và frontend origin `http://127.0.0.1:5173`. Node trong container dùng hostname `postgres:5432`; công cụ test trên host dùng `127.0.0.1:5434`.

## 4. Build và unit/component test

| Bước | Trạng thái | Kết quả thực tế |
| --- | --- | --- |
| `npm ci` backend/frontend | PASS | Cài theo lockfile, không gặp `Invalid Version` |
| `npm run db:generate` | PASS | Prisma Client sinh ra `@ibanking/db` |
| `npm run build` backend | PASS | TypeScript biên dịch và copy specs/docs |
| `npm run build` frontend | PASS | TypeScript và Vite production build |
| `mvn verify` Notification | PASS | Build JAR, 10/10 JUnit |
| `npm test` backend không DB mode | PASS | 4 đạt, 6 skip đúng thiết kế |
| `RUN_CORE_DB_TESTS=1 npm run test:core` | PASS | 10/10, không skip |
| `npm test` frontend | PASS | 11 mock/domain HTTP + 13 React/Vitest = 24/24 |
| `docker compose config -q` và image build | PASS | Cấu hình hợp lệ; tám container healthy |
| Lint | NOT RUN | Hai package.json không khai báo lint script |

## 5. API và thanh toán từ đầu đến cuối

- PASS: `npm run test:e2e` 19/19 trên API thật, schema test, Notification thật và Mailpit local. Bao phủ login đúng/sai, JWT, hồ sơ, balance, MSSV có/không có, học phí đã trả, thiếu tiền, intent, OTP, giao dịch hoàn tất, lịch sử và email.
- PASS: `npm run test:processes` 1/1 khởi động từng Node service với role riêng, gọi thanh toán xuyên service rồi restart từng process để kiểm tra độc lập.
- PASS: smoke trực tiếp qua stack Compose đang chạy dùng user/MSSV ngẫu nhiên mới: login → số dư 10 triệu → học phí 7 triệu UNPAID → intent → OTP trong Mailpit → confirm → payment COMPLETED → số dư 3 triệu → học phí PAID → lịch sử và biên nhận. Demo fixture `demo1` không bị tiêu thụ.
- PASS: token thiếu/giả/hết hạn và protected API bị từ chối (core test); sai mật khẩu 401 và MSSV không tồn tại 404 (E2E/live smoke).
- PASS: CORS preflight từ frontend origin `http://127.0.0.1:5173` trả 204, cho phép `authorization,content-type,idempotency-key`.
- PASS: OTP sai, hết hạn, đã dùng và OTP của giao dịch khác bị từ chối; OTP hợp lệ thành công. TC07 đặt thời hạn OTP về quá khứ trong schema test để kiểm tra nhánh hết hạn, không đợi 5 phút thật.

## 6. Transaction và concurrency

| Kịch bản | Trạng thái | Bằng chứng |
| --- | --- | --- |
| A: 10 triệu, hai debit đồng thời 7 triệu | PASS | Core DB test: một 200, một 402, số dư 3 triệu |
| B: hai tài khoản trả cùng học phí | PASS | E2E TC11: một COMPLETED, một FAILED, không trừ tiền thứ hai |
| C: cùng paymentId/idempotency key gửi lại | PASS | Core retry; E2E TC12 và test hai intent cùng khóa chỉ tạo một Payment |
| D: OTP sai/hết hạn/đã dùng/khác giao dịch/hợp lệ | PASS | E2E TC06–TC07 và live Compose smoke |
| E: mất phản hồi, lỗi sau debit, recovery/refund | PASS | E2E TC13, TC13b–d; core rollback và CHECK số dư không âm |

## 7. UI/UX

- PASS: route source có Login, Dashboard, Payment, OTP, Result, History; Vite đang phục vụ HTML 200 trong real API mode; component tests kiểm tra OTP input, chống double-submit và không hiển thị PENDING như thành công.
- BLOCKED: kiểm tra trực quan desktop/mobile, loading/error state trong trình duyệt và luồng click React → Gateway. Công cụ Computer Use tự dừng vì không xác định URL hiện tại đủ tin cậy; không thử vượt qua. Do đó chưa đánh dấu PASS cho responsive hay E2E qua UI.

## 8. Lỗi và thay đổi

- Lỗi cấu hình local ban đầu: `DEMO_EMAIL` bị ghép với URL role khi tạo file `.env` test, gây lỗi seed `varchar(100)`. Đã sửa newline trong file local đã ignore; seed chạy lại PASS. Không sửa schema hay source.
- Script smoke tạm ban đầu dùng top-level await không hợp với CommonJS. Đã bọc async function, chạy PASS và xóa script tạm.
- `npm audit --omit=dev`: backend báo 4 high (`@prisma/config`, `deepmerge-ts`, `nodemailer`, `prisma`); frontend 0. `nodemailer` yêu cầu major upgrade để hết advisory theo npm audit. Chưa nâng dependency/lockfile vì có thể ảnh hưởng contract; cần đánh giá riêng trước khi đưa ra Internet.
- Không có lỗi build/test/API còn mở tại thời điểm báo cáo. Không thay đổi source hoặc nghiệp vụ thanh toán. File mới duy nhất không ignore là báo cáo này.

## 9. Giới hạn và kết luận

- NOT RUN: SMTP/email ngoài Mailpit; kiểm thử trình duyệt desktop/mobile thực tế; thử OTP chờ đủ 5 phút ngoài đời; lint vì repo không có script.
- Các service, database và Mailpit đang chạy để demo. Có thể mở `http://127.0.0.1:5173/` và Mailpit `http://127.0.0.1:8026/`. User demo là `demo1`; mật khẩu test nằm trong `.env` local đã ignore.
- Kết luận: **sẵn sàng chạy thử và demo luồng backend/API thật**. Trước buổi trình diễn, người trong nhóm nên mở giao diện và kiểm tra nhanh desktop/mobile cùng một giao dịch UI thực tế vì phần tự động hóa trình duyệt bị chặn.

## 10. Khởi động lại

Trong checkout QA này, giữ các file `.env`, `.env.compose.local` và `frontend/.env` local. Sau khi mở Docker Desktop:

```powershell
docker compose -p ibanking-full-qa --env-file .env.compose.local -f docker-compose.yml -f compose.integration.yml -f compose.microservices.yml up -d --wait
npm.cmd run dev:ui --prefix frontend
```

Kiểm tra `docker ps --filter name=ibanking-full-qa`, `http://127.0.0.1:4010/health`, `http://127.0.0.1:8086/health` và `http://127.0.0.1:5173/`. Không chạy lại seed trên dữ liệu demo đang dùng. Các service cũ ở port 5433/8025/8085 được giữ nguyên.
