# FINAL AUDIT REPORT — iBanking Tuition Payment System

**Ngày:** 15/11/2026 (UTC+7)
**Nhánh:** `fix/microservices-architecture`
**HEAD khi audit:** `a80c43f`
**Trạng thái:** **NOT READY — CRITICAL ISSUES**
**Phạm vi:** code hiện tại tại `D:\Midterm_SOA`, ảnh đề bài/rubric do người dùng cung cấp, schema test riêng `micro_test_final_20261115`. Không dùng dữ liệu ngân hàng thật.

## 1. Tóm tắt

Hệ thống có năm tiến trình Node.js/Express/TypeScript (Gateway, Auth, Account, Student, Payment), Notification Spring Boot, PostgreSQL, Mailpit và React/Vite. Compose chạy tám container healthy. Kiểm thử trên schema riêng: core DB **10/10**, API E2E **19/19**, process/role độc lập **1/1**, Notification JUnit **10/10**, frontend mock/component **24/24**. Build backend/frontend đạt. Các test E2E dùng Notification thật và Mailpit local, không thay thế browser E2E.

Hai điểm cần xử lý trước khi khẳng định đáp ứng **toàn bộ** đề: (1) chưa bảo đảm OTP số không trùng với OTP còn hiệu lực của giao dịch khác trong lúc tạo đồng thời; (2) chưa kiểm thử toàn bộ luồng thanh toán bằng browser automation. Tài liệu mô hình dữ liệu cũ còn mô tả OTP lưu dạng mã sáu số và thiếu trạng thái recovery, khác code hiện tại. Không tự ý sửa logic tài chính trong audit này.

## 2. Checklist yêu cầu chức năng

| Yêu cầu | Kết quả | Bằng chứng / giới hạn |
| --- | --- | --- |
| Username/password, hồ sơ, điện thoại, email, số dư | PASS | `src/auth-service/index.ts`, `src/account-service/index.ts`; E2E TC01–TC03 |
| Mật khẩu hash, JWT, API bảo vệ, dữ liệu đúng chủ | PASS | scrypt + salt, JWT HS256 15 phút tại `src/shared/auth.ts`; `payment.routes.ts` ràng buộc account/payment theo JWT; core/E2E auth tests |
| Tra MSSV và học phí, trả cho sinh viên khác | PASS | Student routes; E2E TC04–TC05, TC11; payer lấy từ account đã đăng nhập |
| Payer tự điền và không sửa | PASS (code) | `PaymentPage.tsx` dùng readOnly; Payment route ghi đè `accountId`/`payerEmail` từ account, không tin body client |
| Chỉ trả toàn bộ, học phí PAID/số dư thiếu bị từ chối | PASS | `payment.service.ts` so sánh amount với tuition; E2E TC08–TC09 |
| Nút xác nhận yêu cầu dữ liệu hợp lệ | PASS (code/component) | Zod, `eligible` và modal trong PaymentPage; browser click chưa xác minh |
| OTP gắn payment, gửi email, hạn 5 phút, một lần | PASS | `otp.service.ts`, Notification + Mailpit; E2E TC06–TC07, TC15 |
| OTP sai/hết hạn/replay/giao dịch khác bị từ chối | PASS trên ca thử | E2E và core; không có test cưỡng ép va chạm mã số |
| OTP số khác nhau giữa mọi giao dịch đang hiệu lực | **PARTIAL** | `crypto.randomInt(100000,1000000)` không kiểm tra trùng số đang hoạt động; HMAC(paymentId:code) ngăn dùng nhầm nhưng không ngăn cùng sáu chữ số |
| Sau OTP: debit, PAID, lịch sử, biên nhận | PASS API | E2E TC06, TC14–TC15 và process test; UI browser E2E chưa xác minh |
| Email biên nhận lỗi không đảo giao dịch | PASS (code/test một phần) | `deliverReceipts` retry theo `receiptSent` sau COMPLETED; SMTP lỗi kéo dài cần vận hành/quan sát |
| Tạo tài khoản mới | Không yêu cầu | Seed demo, không có registration API |

## 3. Kiến trúc và SOA

`compose.microservices.yml` tạo container riêng cho Gateway, Auth, Account, Student và Payment. Gateway định tuyến allowlist, giữ nguyên path `/api`, kiểm JWT, không có DB URL. Notification chạy Spring Boot trong container riêng (`compose.integration.yml`). Giao tiếp nội bộ qua HTTP REST, JWT và service token. PostgreSQL là **một server và một schema**, bốn role chỉ được cấp bảng của service tương ứng (`prisma/provision-micro-roles.ts`). `test:processes` đã kiểm role không đọc được bảng service khác.

Account gọi Auth để lấy hồ sơ; Payment gọi Account/Student/Notification. Payment chỉ đọc/ghi `payments`, `otp_codes`; Student sở hữu `students`, `tuition_fees`; Account sở hữu `accounts`, `account_debits`; Auth sở hữu `users`. Tiến trình `src/run-all.ts` cũng spawn riêng từng service khi chạy local. Sơ đồ hiện tại trong README phù hợp deployment Compose. `docs/tv1.md` ghi rõ “chế độ TV1” nhưng chứa kiến trúc giai đoạn cũ, không nên trình bày nó như sơ đồ cuối.

## 4. REST API và frontend contract

| Qua Gateway | Xác thực | Kiểm tra |
| --- | --- | --- |
| `POST /api/auth/login`; `GET /api/auth/me` | Login mở, me cần JWT | Đúng/sai password, JWT thiếu/sai/hết hạn đã test |
| `GET /api/accounts/me`, `/balance`, `/transactions` | JWT, account của chủ token | Core/E2E, không truy cập account khác |
| `GET /api/students/:studentCode`; `/api/tuitions/student/:studentCode` | JWT | MSSV có/không có đã test |
| `POST /api/payments/create-intent`; `/confirm-otp` | JWT + sở hữu account/payment | amount, UUID, OTP, idempotency, thiếu tiền, PAID đã test |
| `GET /api/payments/:paymentId`; `/account/:accountId` | JWT + owner check | Lịch sử/trạng thái đã test |
| `GET /health`, `/docs/`, `/docs.json` | Mở | Gateway health/Swagger trong code |

Gateway không publish Account deduct/refund, Student reserve/commit/release hoặc Notification internal endpoints. Frontend `VITE_API_BASE_URL` dùng `/api` và adapter ở `frontend/src/services/` khớp response thật; môi trường live đã smoke login → account → student/tuition, CORS preflight 204. Frontend mock có API và hành vi khác, cần giữ rõ `VITE_DEMO_MODE=false` khi demo backend thật. Contract Swagger/OpenAPI tồn tại tại `docs/*.openapi.yaml` và `specs/.../contracts/openapi.yaml`; tài liệu TV1 có chi tiết lịch sử.

## 5. Database, tiền và persistence

`prisma/schema.prisma` có bảy bảng: `users`, `accounts`, `account_debits`, `students`, `tuition_fees`, `payments`, `otp_codes`. FK nội bộ AccountDebit→Account, TuitionFee→Student, OtpCode→Payment. Quan hệ xuyên service lưu ID logic, không có FK liên service. `users.username`, `accounts.user_id`, `students.student_code`, `payments.transaction_reference` có unique; `account_debits.payment_id` là PK. `sql/payment-recovery.sql` có partial unique index một COMPLETED per tuition. `sql/account-schema.sql` có CHECK balance không âm.

Số dư/ledger dùng PostgreSQL `bigint`; học phí/payment dùng `Decimal(12,2)` nhưng SQL CHECK yêu cầu VND nguyên, HTTP kiểm `Number.isSafeInteger` trước chuyển sang `BigInt`. Mức tiền được kiểm giới hạn ở Account API. Không thấy tính toán tiền cốt lõi bằng float không an toàn trong miền được phép. PostgreSQL Compose dùng named volume; process restart test đã chạy, không xóa dữ liệu. Repo dùng `prisma db push` + SQL scripts, **không có versioned migration** cho production; phải dùng schema mới, tránh áp trực tiếp lên dữ liệu cũ.

## 6. Transaction, concurrency và recovery

| Ca | Kết quả chạy lại | Kiểm chứng |
| --- | --- | --- |
| Một account, hai debit vượt số dư | PASS | Core DB: 10 triệu, hai debit 7 triệu → một 200, một 402, số dư 3 triệu; E2E TC10 |
| Hai account trả một học phí | PASS | E2E TC11: đúng một COMPLETED, bên thua không mất tiền, tuition PAID một lần |
| Retry cùng `paymentId`/idempotency key | PASS | Ledger PK, unique key; core DB/E2E TC12 và hai intent cùng khóa |
| Lỗi sau debit / mất phản hồi / refund | PASS trên fault injection | E2E TC13, TC13b–d; worker restart và trạng thái REVIEW_REQUIRED |
| OTP concurrent confirm/replay | PARTIAL | Lock payment row + compare-and-set `isUsed` trong code; E2E xác minh replay, chưa có test cưỡng ép hai confirm đồng thời với cùng OTP |

`src/account-service/debit.ts` dùng transaction ReadCommitted, ledger PK + `FOR UPDATE` và `UPDATE ... WHERE balance >= amount`. Student reserve/commit khóa `tuition_fees FOR UPDATE`. Payment ghi bền trạng thái PROCESSING/REFUND_PENDING trước HTTP call, retry bằng `paymentId`, hoàn tiền khi có bằng chứng commit thất bại, chuyển REVIEW_REQUIRED khi vượt giới hạn thử. Đây là **eventual consistency/compensation**, không phải distributed ACID. Khi HTTP trả kết quả mơ hồ, không được coi là debit thất bại và trừ lại bằng request mới.

## 7. Frontend và browser E2E

Các màn hình Login, Dashboard, Account, Payment, OTP, Result, History có trong `frontend/src/pages/`. UI dùng React Query loading/error, Zod cho MSSV, payer readOnly, điều kiện `eligible`, OTP countdown và màn hình riêng cho PENDING/PROCESSING/REVIEW_REQUIRED. Frontend test đạt 11 mock/domain + 13 component. Build frontend đạt. Live HTTP smoke qua Gateway đạt; **luồng click toàn bộ trên browser chưa được chạy trong audit này**, nên trạng thái browser E2E là **NOT VERIFIED**, dù các API E2E 19/19 đạt. Kỹ năng computer-use yêu cầu xác nhận ngay trước thao tác xác nhận giao dịch tài chính trên UI; audit không tự thực hiện bước đó từ ảnh/đoạn văn đính kèm.

## 8. Security và GitHub readiness

- Không thấy secret value hoặc private key trong tracked files khi scan; `.env`, role URLs, audit config, local build output đều được Git ignore. `.env.example` chứa placeholder trống/CHANGE_ME.
- Password dùng scrypt + salt; JWT HS256 ký với secret >=32 byte, hạn 15 phút; OTP lưu HMAC và không log plaintext trong code server. Nội dung OTP chỉ đi qua Notification/Mailpit local.
- Service token và bảng theo role hạn chế cross-service DB access; Gateway allowlist; CORS theo `FRONTEND_ORIGIN`; input validation tại Gateway/service.
- Giới hạn: JWT đã cấp không bị thu hồi ngay khi admin reset password; không có revoke list. `prisma/reset-password.ts` và phần README tương ứng là thay đổi **chưa commit** từ lượt trước; cần review trước khi đưa vào submission.
- Không thấy dữ liệu ngân hàng thật. Có thể có dữ liệu demo và email `*.test`. `.github/` trong working tree đang ignored/untracked; xác minh riêng trước khi kỳ vọng GitHub Actions hoạt động.
- `git status` hiện **không sạch**: README, package.json sửa; `prisma/reset-password.ts` và báo cáo này chưa track. Không commit/push trong audit.

## 9. Rubric — ước lượng 8.0/10

Điểm là ước lượng kỹ thuật, không thay điểm của giảng viên.

| Hạng mục | Tối đa | Trạng thái | Ước lượng | Bằng chứng, thiếu sót và hành động nhỏ nhất |
| --- | ---: | --- | ---: | --- |
| Phân tích nghiệp vụ & UML | 1.0 | PARTIAL | 0.6 | `docs/tv1.md` có use case Mermaid; `specs/.../data-model.md` có ERD nhưng chỉ Student/Payment và cũ. Cập nhật Use Case + ERD toàn hệ thống từ schema hiện tại. |
| Kiến trúc Microservices | 1.5 | PASS/PARTIAL | 1.3 | Năm process Node và Notification độc lập, role table ownership, process test đạt. Ghi rõ shared PostgreSQL/schema và giới hạn eventual consistency. |
| REST API | 1.0 | PASS | 0.9 | Gateway allowlist, Swagger/OpenAPI, E2E valid/invalid. Rà lại docs TV1 cũ và bổ sung contract lỗi 202/409 rõ hơn. |
| Database & Data Persistence | 1.0 | PARTIAL | 0.8 | Bảy bảng, constraint, volume, restart test. Thiếu versioned migrations và ERD tổng thể; bổ sung migration strategy. |
| Chức năng & Payment Workflow | 2.0 | PARTIAL | 1.7 | API E2E/OTP/email đạt; browser full flow chưa xác minh, OTP uniqueness toàn cục thiếu. |
| Transaction & Concurrency | 1.5 | PASS/PARTIAL | 1.3 | TC10/TC11 và DB assertions đạt; bổ sung concurrent OTP confirm và collision test. |
| UI & Integration | 0.5 | PARTIAL | 0.4 | 24 frontend tests/build, live API smoke; chạy browser E2E có ảnh/video kết quả. |
| Documentation/Deployment/Demo | 1.5 | PARTIAL | 1.0 | README chạy fresh clone/Compose đã có; sơ đồ/ERD cũ, demo browser chưa xác minh, JDK host mặc định 11 cần hướng dẫn JAVA_HOME. |
| **Tổng** | **10.0** |  | **8.0** |  |

## 10. Vấn đề ưu tiên

1. **P1 — OTP số có thể trùng giữa hai giao dịch hiệu lực.** `otp.service.ts` sinh ngẫu nhiên sáu chữ số, HMAC có `paymentId`; chưa có kiểm tra uniqueness toàn cục hoặc serialization lúc phát mã. Theo đề, phải bảo đảm mã không trùng. Sửa cần giữ khả năng verify, kiểm collision dưới concurrent intent, đánh giá hiệu năng và tránh log plaintext. **Rủi ro tài chính/đa service**, chưa sửa trong audit.
2. **P2 — Browser E2E chưa xác minh.** API E2E không chứng minh đầy đủ click flow, lỗi hiển thị, mobile layout. Chạy trên fixture riêng và lưu bằng chứng.
3. **P2 — UML/ERD giai đoạn cũ.** `data-model.md` mô tả OTP code plaintext và thiếu PROCESSING/REFUND_PENDING/REVIEW_REQUIRED; `tv1.md` là kiến trúc TV1. Cập nhật sơ đồ cuối, tránh nộp nhầm.
4. **P2 — Migration strategy.** `db:push` phù hợp demo schema mới, không thay migration versioned cho DB có dữ liệu.
5. **P3 — Admin reset password chưa có test thành công trong audit.** Script build đạt, trường hợp username không tồn tại được từ chối; chưa đổi mật khẩu tài khoản demo của người dùng.

## 11. Lệnh và bằng chứng thực thi

- `git status --short --branch`; `git log -1 --oneline`; `git ls-files`; `git check-ignore .env .env.audit.local .env.compose.local .env.micro-roles.local frontend/.env`; scan tracked secret candidates (0).
- Tạo schema `micro_test_final_20261115` qua env override: `npm.cmd run db:push -- --skip-generate`, `npm.cmd run db:account`, `npm.cmd run db:recovery`, `npm.cmd run db:roles`. File role live được backup/restore, audit env giữ trong file ignored `.env.audit.local`.
- `npm.cmd test`: 4 pass, 6 DB skip đúng thiết kế; `RUN_CORE_DB_TESTS=1 npm.cmd run test:core`: **10/10**.
- `npm.cmd run test:e2e`: **19/19**; `npm.cmd run test:processes`: **1/1** trên schema test riêng.
- `npm.cmd test --prefix frontend`: **24/24** (11 Node mock + 13 Vitest). `npm.cmd run build` backend và `npm.cmd run build --prefix frontend` đạt trong lượt cấu hình trước; TypeScript build lại sau script reset cũng đạt.
- `.\mvnw.cmd verify -q` với JDK mặc định 11: FAIL do release 17 không hỗ trợ; đặt `JAVA_HOME=C:\Program Files\Android\Android Studio\jbr` (JDK 25) rồi chạy lại: PASS, Surefire XML **10 tests, 0 errors/failures/skips**.
- `docker compose -p ibanking-live --env-file .env.compose.local -f docker-compose.yml -f compose.integration.yml -f compose.microservices.yml ps`: tám container healthy trong lượt chạy live. Live Gateway smoke login/account/student/tuition và CORS 204 đã thực hiện trước audit.
- `git diff --check`: không có whitespace error.

## 12. File thay đổi và quyết định submission

Audit này tạo **`docs/FINAL_AUDIT_REPORT.md`**. Từ lượt trước còn `README.md`, `package.json` và `prisma/reset-password.ts` chưa commit; audit không thay code ứng dụng, schema hay dữ liệu demo. Schema test/role audit và file env local bị ignore, không đưa lên Git.

**NOT READY — CRITICAL ISSUES.** Cần giải quyết hoặc được giảng viên chấp nhận bằng tài liệu về khoảng trống OTP uniqueness, kiểm browser E2E và cập nhật UML/ERD trước khi tuyên bố đáp ứng đầy đủ đề. Không thực hiện `git commit` hay `git push`.
