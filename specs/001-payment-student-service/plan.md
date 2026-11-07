# Implementation Plan: Student & Payment Services

**Branch**: `001-payment-student-service` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)  
**Input**: Feature specification from `specs/001-payment-student-service/spec.md`

---

## Summary
Xây dựng 2 microservices: **Student Service** (quản lý thông tin sinh viên, tra cứu nợ học phí) và **Payment Service** (tạo giao dịch, sinh & xác thực OTP, trừ tiền, cập nhật trạng thái học phí) bằng **Node.js + TypeScript + Express + Prisma + PostgreSQL**. Hệ thống đảm bảo tính toàn vẹn và nhất quán dữ liệu cao trong môi trường phân tán bằng cơ chế **PostgreSQL Pessimistic Locking (`SELECT FOR UPDATE`)** kết hợp **Prisma Interactive Transaction**, đi kèm bộ kịch bản kiểm thử tải đồng thời chống race condition.

---

## Technical Context

**Language/Version**: Node.js v20+ LTS / v22, TypeScript 5.x (`tsx` runtime)  
**Primary Dependencies**: Express 4.x, Prisma ORM 5.x/6.x, Nodemailer, Axios, Zod (schema validation), UUID  
**Storage**: PostgreSQL 16  
**Testing**: Vitest / Node test runner + Custom concurrency runner (`Promise.all` stress test)  
**Target Platform**: Node.js runtime / Docker containers  
**Project Type**: Monorepo microservices (`services/student-service`, `services/payment-service`, `services/mock-account-service`, `packages/shared`)  
**Performance Goals**: API phản hồi < 150ms; chịu tải đồng thời 50-100 concurrent checkout requests mà không sai lệch số dư / học phí  
**Constraints**: Zero duplicate payment (Chỉ đúng 1 giao dịch nộp học phí thành công cho 1 MSSV); No negative account balance  

---

## Constitution Check
- Microservices Separation: Student và Payment tách biệt rõ ràng, giao tiếp qua HTTP REST.
- Single Source of Truth: Học phí chỉ do Student/Tuition quản lý; Giao dịch & OTP do Payment quản lý.
- Data Consistency: Xử lý Transaction ACID và Pessimistic Lock ở tầng persistence.
- Fail-safe & Testable: Có Mock Account Service để phát triển và test độc lập.

---

## Project Structure

### Documentation (this feature)
```text
specs/001-payment-student-service/
├── spec.md              # Functional specification
├── plan.md              # This file
├── research.md          # Technical research & decisions
├── data-model.md        # ERD & Prisma schema
├── quickstart.md        # Setup & execution guide
├── contracts/
│   └── openapi.yaml     # OpenAPI 3.0 spec for Student & Payment APIs
└── tasks.md             # Task breakdown & execution order
```

### Source Code Architecture
```text
.
├── prisma/
│   ├── schema.prisma            # Single unified schema or multi-schema
│   └── seed.ts                  # Seed script (Sinh viên TDTU, học phí mẫu)
├── src/
│   ├── student-service/         # Student & Tuition Fee Service (Port 4001)
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── routes/
│   │   └── index.ts
│   ├── payment-service/         # Payment & OTP Service (Port 4002)
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── routes/
│   │   ├── mailer/              # Nodemailer OTP & receipt sender
│   │   └── index.ts
│   ├── mock-account-service/    # Mock TV1's Account Service (Port 4003)
│   │   ├── index.ts
│   │   └── accounts.store.ts
│   └── shared/                  # Shared types, error handlers, db client
│       ├── prisma.ts
│       └── utils.ts
├── tests/
│   └── concurrency/             # Stress test race condition scripts
│       ├── duplicate-payment.test.ts   # 2 người cùng đóng 1 MSSV
│       └── double-spending.test.ts     # 1 tài khoản bắn nhiều request
├── package.json
├── tsconfig.json
└── docker-compose.yml           # PostgreSQL container setup
```

---

## Execution Phases
1. **Phase 1: Project Setup & Database**: Khởi tạo project, TypeScript, Prisma schema, Docker PostgreSQL, seed data sinh viên & học phí TDTU.
2. **Phase 2: Student Service Implementation**: Cung cấp API tra cứu thông tin sinh viên theo MSSV (`GET /api/students/:studentCode`) và API lấy học phí (`GET /api/tuitions/student/:studentCode`).
3. **Phase 3: Payment & OTP Service Implementation**:
   - API tạo giao dịch PENDING (`POST /api/payments/create-intent`), sinh OTP 6 số, gửi mail qua Nodemailer.
   - API xác nhận OTP (`POST /api/payments/confirm-otp`) với Interactive Transaction và Pessimistic Lock (`SELECT FOR UPDATE`).
   - Cập nhật Payment sang COMPLETED, TuitionFee sang PAID, gửi email biên lai thành công.
4. **Phase 4: Mock Account Service**: Giả lập API kiểm tra số dư và trừ tiền tài khoản của Thành viên 1.
5. **Phase 5: Concurrency Testing**: Viết và chạy kịch bản kiểm thử tải song song chống thanh toán trùng và double-spending.
6. **Phase 6: Documentation & Deliverables**: Hoàn thiện Swagger UI, hướng dẫn cài đặt, báo cáo kiến trúc và concurrency.

