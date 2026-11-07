---
description: "Task list for Student & Payment Services implementation"
---

# Tasks: Student & Payment Services (iBanking Tuition Payment)

**Input**: Design documents from `specs/001-payment-student-service/`
**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/openapi.yaml`

---

## Format: `- [ ] [TaskID] [P?] [Story?] Description with file path`
- **[P]**: Parallelizable task
- **[US1..US4]**: User Story label

---

## Phase 1: Setup (Project & Shared Infrastructure)

**Purpose**: Khởi tạo project TypeScript monorepo, dependencies, Docker Compose cho PostgreSQL.

- [x] T001 Initialize Node.js TypeScript project with `package.json` and `tsconfig.json` at root
- [x] T002 [P] Create `docker-compose.yml` for PostgreSQL 16 container setup
- [x] T003 [P] Configure environment template in `.env.example`

---

## Phase 2: Foundational (Database & Shared Modules)

**Purpose**: Thiết lập Prisma ORM, models, database migration và seed dữ liệu mẫu sinh viên TDTU.

- [x] T004 Define Prisma schema in `prisma/schema.prisma` and export standalone DDL in `sql/schema.sql` with tables `students`, `tuition_fees`, `payments`, `otp_codes`
- [x] T005 [P] Implement Prisma client singleton and database helper in `src/shared/prisma.ts`
- [x] T006 [P] Implement common response & error handling middleware in `src/shared/response.ts`
- [x] T007 Create seed script in `prisma/seed.ts` with sample TDTU students (e.g., `521H0001`, `521H0002`) and tuition fee records

---

## Phase 3: User Story 1 - Tra cứu thông tin sinh viên & học phí (Priority: P1) 🎯 MVP

**Goal**: Cung cấp API tra cứu thông tin sinh viên và các khoản học phí còn nợ theo MSSV.

**Independent Test**: Gửi `GET /api/students/521H0001` và `GET /api/tuitions/student/521H0001`, kiểm tra mã 200, họ tên và số tiền học phí còn nợ.

- [x] T008 [P] [US1] Implement Student & Tuition repository queries in `src/student-service/services/student.service.ts`
- [x] T009 [US1] Implement Student & Tuition controllers in `src/student-service/controllers/student.controller.ts`
- [x] T010 [US1] Setup Express routes and HTTP server in `src/student-service/routes/student.routes.ts` and `src/student-service/index.ts` (Port 4001)

---

## Phase 4: User Story 2 - Tạo yêu cầu thanh toán & Sinh OTP (Priority: P1)

**Goal**: Tạo giao dịch thanh toán ở trạng thái `PENDING`, sinh OTP 6 số ngẫu nhiên (hạn 5 phút) và gửi email qua Nodemailer.

**Independent Test**: Gửi `POST /api/payments/create-intent`, kiểm tra payment record được tạo với status `PENDING`, OTP được lưu và link preview email được log ra console.

- [x] T011 [P] [US2] Implement Nodemailer service with Ethereal fallback in `src/payment-service/mailer/mailer.service.ts`
- [x] T012 [P] [US2] Implement OTP generator and persistence logic in `src/payment-service/services/otp.service.ts`
- [x] T013 [US2] Implement Payment Intent creation logic in `src/payment-service/services/payment.service.ts`
- [x] T014 [US2] Implement Payment controller and routes in `src/payment-service/controllers/payment.controller.ts` and `src/payment-service/routes/payment.routes.ts` (Port 4002)

---

## Phase 5: User Story 3 - Xác nhận OTP & Hoàn tất thanh toán với Concurrency Lock (Priority: P1)

**Goal**: Xác thực OTP, thực thi Interactive Transaction với Pessimistic Lock (`SELECT ... FOR UPDATE`), trừ tiền qua Account Service, cập nhật `COMPLETED` cho Payment và `PAID` cho TuitionFee.

**Independent Test**: Gửi `POST /api/payments/confirm-otp` với mã OTP hợp lệ, kiểm tra trạng thái chuyển sang `COMPLETED`, học phí chuyển `PAID`, gửi mail hóa đơn thành công.

- [x] T015 [US3] Implement Account Service client for balance inquiry and deduction in `src/payment-service/services/account-client.service.ts`
- [x] T016 [US3] Implement OTP verification and Pessimistic Lock transaction in `src/payment-service/services/payment.service.ts`
- [x] T017 [US3] Add email confirmation on successful payment in `src/payment-service/mailer/mailer.service.ts`
- [x] T018 [US3] Integrate confirm-otp endpoint into `src/payment-service/controllers/payment.controller.ts`

---

## Phase 6: Mock Account Service (Mô phỏng dịch vụ của Thành viên 1)

**Purpose**: Cung cấp API giả lập Account Service để nhóm phát triển và test độc lập các ca trừ tiền, kiểm tra số dư.

- [x] T019 Implement Mock Account Service with in-memory / DB accounts store in `src/mock-account-service/index.ts` (Port 4003) supporting `GET /api/accounts/:id` and `POST /api/accounts/deduct`

---

## Phase 7: User Story 4 - Kiểm thử Concurrency & Chống thanh toán trùng (Priority: P2)

**Goal**: Chứng minh hệ thống ngăn chặn triệt để race condition:
1. Hai người cùng lúc đóng học phí cho 1 MSSV.
2. Một tài khoản gửi nhiều request thanh toán đồng thời vượt số dư.

**Independent Test**: Chạy `npm run test:concurrency`, kiểm tra kết quả 50 concurrent requests chỉ có đúng 1 request thành công.

- [x] T020 [P] [US4] Implement concurrent duplicate payment test script in `tests/concurrency/duplicate-payment.test.ts`
- [x] T021 [P] [US4] Implement concurrent double-spending test script in `tests/concurrency/double-spending.test.ts` and rollback compensation test in `tests/concurrency/compensation-rollback.test.ts`
- [x] T022 [US4] Add npm script `test:concurrency` to execute all stress tests and assert single success guarantee

---

## Phase 8: Polish, API Documentation & Deliverables

**Purpose**: Tích hợp Swagger UI, viết tài liệu kỹ thuật chi tiết theo yêu cầu đề bài.

- [x] T023 Setup Swagger UI documentation route in Student and Payment services loading `specs/001-payment-student-service/contracts/openapi.yaml`
- [x] T024 Write complete technical report and submission guide in `README.md` covering architecture, API endpoints, database schema, and concurrency mechanisms

