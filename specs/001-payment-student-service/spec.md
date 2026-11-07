# Feature Specification: Student & Payment Services (iBanking Tuition Payment)

**Feature Branch**: `001-payment-student-service`  
**Created**: 2026-11-07  
**Status**: Clarified  
**Input**: User description: "Xây dựng Student Service, Payment Service bằng Node.js + Prisma + PostgreSQL. API tra cứu sinh viên, học phí; tạo giao dịch, xác nhận OTP; quản lý trạng thái PENDING, COMPLETED, FAILED; thiết kế bảng students, tuition_fees, payments, otp_codes; xử lý transaction & concurrency; kiểm thử chống thanh toán trùng; viết tài liệu."

---

## Clarifications & Architecture Decisions (Post-Clarification)

- **Repository & Database Structure**: Monorepo gồm 2 services độc lập (`student-service`, `payment-service`). Dùng chung 1 PostgreSQL server nhưng phân tách model/bảng rõ ràng (hoặc database riêng trên cùng 1 server).
- **Giao tiếp liên dịch vụ (Inter-service Communication)**: Payment Service giao tiếp với Account Service (của Thành viên 1) qua REST API nội bộ (`POST /api/accounts/deduct`, `GET /api/accounts/:id`). Đi kèm một Mock Account Service tích hợp sẵn để phục vụ phát triển độc lập và chạy test.
- **Cơ chế xử lý Concurrency (Chống thanh toán trùng & Race Condition)**: Sử dụng PostgreSQL Interactive Transaction kết hợp **Pessimistic Locking (`SELECT ... FOR UPDATE`)** thông qua Prisma raw query (`$queryRaw`) để lock dòng `tuition_fees` của sinh viên, đảm bảo tính tuần tự tuyệt đối (serializability) khi có nhiều giao dịch tranh chấp cùng lúc.
- **Dịch vụ gửi Email OTP**: Tích hợp trực tiếp Nodemailer trong Payment Service, hỗ trợ cấu hình linh hoạt: Ethereal Email (auto-generate mock inbox cho local test) hoặc Gmail SMTP thực tế.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tra cứu thông tin sinh viên và học phí (Priority: P1)
Người dùng iBanking nhập MSSV trên giao diện thanh toán học phí. Hệ thống gọi Student Service để lấy thông tin chi tiết sinh viên và khoản học phí cần nộp.

**Why this priority**: Là bước khởi đầu bắt buộc của toàn bộ luồng thanh toán học phí iBanking. Nếu không tra cứu được sinh viên hoặc học phí, không thể tạo giao dịch.

**Independent Test**: Gửi HTTP GET request tới endpoint tra cứu với MSSV hợp lệ và không hợp lệ; kiểm tra kết quả trả về đúng họ tên, số tiền học phí còn nợ và trạng thái.

**Acceptance Scenarios**:
1. **Given** sinh viên có MSSV `521H0001` tồn tại và có học phí chưa thanh toán, **When** gửi request tra cứu `521H0001`, **Then** hệ thống trả về HTTP 200 kèm họ tên, ngành học, số tiền học phí cần đóng, và trạng thái `UNPAID`.
2. **Given** sinh viên có MSSV `521H0002` đã thanh toán học phí (`PAID`), **When** gửi request tra cứu, **Then** hệ thống trả về thông tin sinh viên kèm thông báo học phí đã được thanh toán (số tiền nợ = 0).
3. **Given** MSSV không tồn tại trong hệ thống, **When** gửi request tra cứu, **Then** hệ thống trả về HTTP 404 (Student not found).

---

### User Story 2 - Tạo yêu cầu giao dịch thanh toán & Sinh OTP (Priority: P1)
Người dùng chọn thanh toán khoản học phí cho một MSSV. Payment Service kiểm tra tính hợp lệ của khoản học phí, tạo bản ghi thanh toán ở trạng thái `PENDING`, đồng thời sinh mã OTP gửi về email người nộp tiền.

**Why this priority**: Đóng vai trò khởi tạo giao dịch thanh toán tài chính an toàn, bảo vệ bằng mã OTP 1 lần trước khi trừ tiền.

**Independent Test**: Gửi HTTP POST request tạo giao dịch với `accountId`, `studentId`, `amount`; kiểm tra payment record được tạo với status `PENDING`, mã OTP được sinh (hạn 5 phút) và email được kích hoạt gửi.

**Acceptance Scenarios**:
1. **Given** khoản học phí của sinh viên đang ở trạng thái `UNPAID` và số dư người nộp đủ, **When** người dùng bấm xác nhận tạo giao dịch, **Then** hệ thống tạo bản ghi Payment (`PENDING`), sinh mã OTP 6 chữ số (hiệu lực 5 phút), gửi mail OTP và trả về `paymentId`.
2. **Given** khoản học phí đã có người khác thanh toán hoặc đang có giao dịch xử lý khóa khoản phí, **When** người dùng cố gắng tạo yêu cầu thanh toán, **Then** hệ thống từ chối và trả lời lỗi (Học phí không hợp lệ hoặc đã được thanh toán).

---

### User Story 3 - Xác nhận OTP và Hoàn tất thanh toán đảm bảo nhất quán dữ liệu (Priority: P1)
Người dùng nhập mã OTP đã nhận qua email để xác nhận giao dịch. Payment Service xác thực OTP, phối hợp trừ tiền tài khoản (với Account Service) và cập nhật trạng thái học phí sang `PAID`, payment sang `COMPLETED`.

**Why this priority**: Nghiệp vụ cốt lõi xử lý tiền tệ, phải đảm bảo tính toàn vẹn (ACID transaction) và không xảy ra thanh toán trùng hoặc trừ âm tiền.

**Independent Test**: Gửi HTTP POST xác nhận OTP hợp lệ; kiểm tra trạng thái Payment đổi sang `COMPLETED`, Tuition Fee đổi sang `PAID`, OTP bị vô hiệu hóa. Thử xác nhận với OTP sai hoặc hết hạn để kiểm tra lỗi.

**Acceptance Scenarios**:
1. **Given** giao dịch `PENDING` và OTP hợp lệ còn trong 5 phút, **When** người dùng gửi OTP xác nhận, **Then** hệ thống xác thực thành công, trừ tiền tài khoản, cập nhật trạng thái `COMPLETED` cho Payment, `PAID` cho Tuition Fee, vô hiệu hóa OTP, trả về kết quả thành công kèm mã biên lai.
2. **Given** OTP nhập sai hoặc đã quá 5 phút kể từ lúc sinh, **When** người dùng gửi OTP xác nhận, **Then** hệ thống từ chối xác thực, giữ nguyên trạng thái hoặc chuyển `FAILED` nếu quá 5 lần thử sai.
3. **Given** OTP đã được sử dụng thành công 1 lần, **When** gửi lại cùng mã OTP đó, **Then** hệ thống từ chối (OTP cannot be reused).

---

### User Story 4 - Chống thanh toán trùng & Race Condition (Priority: P2)
Hệ thống phải đứng vững trước các tình huống concurrency:
- Hai người cùng lúc đóng học phí cho 1 sinh viên.
- Một tài khoản bấm gửi nhiều giao dịch thanh toán đồng thời dẫn đến vượt quá số dư khả dụng.

**Why this priority**: Yêu cầu bắt buộc trong đề bài iBanking về Data Consistency trong môi trường Microservices/Phân tán.

**Independent Test**: Viết kịch bản test concurrency (dùng Jest/Autocannon hoặc Node script chạy song song qua `Promise.all`), gửi 10-20 requests song song vào cùng 1 MSSV hoặc cùng 1 tài khoản; kiểm tra chỉ có đúng 1 giao dịch thành công.

**Acceptance Scenarios**:
1. **Given** Sinh viên A có 1 khoản học phí chưa đóng, **When** 2 người dùng gửi đồng thời 2 yêu cầu hoàn tất thanh toán cho cùng MSSV này, **Then** chỉ đúng 1 giao dịch thành công (`COMPLETED`, học phí `PAID`), giao dịch còn lại bị từ chối (`FAILED` / Báo lỗi học phí đã được thanh toán).
2. **Given** Tài khoản có số dư 10.000.000 VNĐ, **When** gửi đồng thời 2 giao dịch mỗi giao dịch 8.000.000 VNĐ, **Then** chỉ 1 giao dịch thành công, giao dịch kia bị từ chối do không đủ số dư khả dụng (không để số dư âm).

---

## Edge Cases

- **Mất kết nối giữa chừng**: Payment Service gọi Account Service trừ tiền nhưng sau đó crash trước khi update Tuition $\rightarrow$ Hệ thống dùng 2-phase confirmation hoặc cơ chế bồi hoàn (reconciliation / auto-refund).
- **Hết hạn giao dịch (Timeout)**: Giao dịch ở trạng thái `PENDING` quá 5 phút mà người dùng không nhập OTP $\rightarrow$ Hệ thống tự động chuyển sang `EXPIRED` / `FAILED`.
- **Brute-force OTP**: Người dùng đoán mã OTP $\rightarrow$ Giới hạn số lần thử tối đa (5 lần), nếu vượt quá thì khóa OTP và hủy giao dịch (`FAILED`).

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Student Service MUST cung cấp API tra cứu sinh viên theo MSSV (`GET /api/students/:studentCode`).
- **FR-002**: Student Service MUST cung cấp API lấy khoản học phí cần thanh toán của sinh viên (`GET /api/tuitions/student/:studentCode`).
- **FR-003**: Student Service MUST cung cấp API cập nhật trạng thái khoản học phí (`PATCH /api/tuitions/:id/pay`) với Pessimistic Lock.
- **FR-004**: Payment Service MUST cung cấp API tạo yêu cầu thanh toán (`POST /api/payments/create-intent`) trả về `paymentId` và kích hoạt sinh OTP.
- **FR-005**: Payment Service MUST sinh mã OTP ngẫu nhiên (6 ký tự số), thời hạn tối đa 5 phút, lưu trong bảng `otp_codes`, gắn với `paymentId`, chỉ dùng 1 lần, và **không trùng với bất kỳ mã OTP nào đang còn hiệu lực của giao dịch khác**.
- **FR-006**: Payment Service MUST cung cấp API xác nhận OTP (`POST /api/payments/confirm-otp`).
- **FR-007**: Payment Service MUST quản lý trạng thái thanh toán gồm: `PENDING`, `COMPLETED`, `FAILED`, `EXPIRED`.
- **FR-008**: Payment Service MUST tích hợp cơ chế Transaction và Database Lock: Pessimistic Row Lock (`SELECT ... FOR UPDATE` trên `tuition_fees` và `payments`) kết hợp Transaction Advisory Lock theo `account_id` (`pg_advisory_xact_lock`) để chống cả 2 kịch bản race condition (2 người đóng cùng 1 MSSV và 1 tài khoản thanh toán nhiều giao dịch cùng lúc).
- **FR-009**: Payment Service MUST gửi email chứa mã OTP và email biên lai khi giao dịch thành công đến email người nộp qua Nodemailer.
- **FR-010**: Cung cấp Mock Account Service để mô phỏng API của Thành viên 1 phục vụ phát triển và kiểm thử độc lập.

### Key Entities

- **Student (`students`)**:
  - `id`: UUID, Primary Key
  - `student_code`: String, Unique (MSSV)
  - `full_name`: String
  - `email`: String
  - `phone`: String
  - `faculty`: String
  - `created_at`, `updated_at`: Timestamp

- **TuitionFee (`tuition_fees`)**:
  - `id`: UUID, Primary Key
  - `student_id`: Foreign Key (`students.id`)
  - `semester`: String (e.g., "HK1_2026_2027")
  - `amount`: Decimal (Số tiền cần nộp)
  - `status`: Enum (`UNPAID`, `PAID`)
  - `created_at`, `updated_at`: Timestamp

- **Payment (`payments`)**:
  - `id`: UUID, Primary Key
  - `account_id`: String (ID tài khoản người nộp phía Account Service)
  - `student_id`: UUID
  - `tuition_fee_id`: UUID
  - `amount`: Decimal
  - `status`: Enum (`PENDING`, `COMPLETED`, `FAILED`, `EXPIRED`)
  - `transaction_reference`: String, Unique
  - `payer_email`: String
  - `failure_reason`: String?
  - `created_at`, `updated_at`: Timestamp

- **OtpCode (`otp_codes`)**:
  - `id`: UUID, Primary Key
  - `payment_id`: Foreign Key (`payments.id`)
  - `code`: String (Mã OTP 6 số)
  - `expires_at`: Timestamp
  - `is_used`: Boolean (Default false)
  - `attempts`: Int (Số lần nhập sai, max 5)
  - `created_at`: Timestamp

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Thời gian phản hồi API tra cứu sinh viên & học phí < 150ms.
- **SC-002**: Khi kiểm thử tải đồng thời (Concurrency Test) với 50 concurrent requests cùng nộp 1 MSSV: Đúng 1 request thành công, 49 requests còn lại bị chặn an toàn, không có hiện tượng thanh toán kép.
- **SC-003**: Khi kiểm thử tải đồng thời với 1 tài khoản số dư có hạn gửi 10 requests thanh toán song song: Không bao giờ bị âm số dư tài khoản.
- **SC-004**: Mã OTP hết hạn sau đúng 300 giây và không thể tái sử dụng lần 2.
- **SC-005**: 100% các API đều có tài liệu OpenAPI / Swagger rõ ràng và kịch bản test tự động.
