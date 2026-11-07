# Data Model: Student & Payment Services

**Branch**: `001-payment-student-service`  
**Date**: 2026-11-07  

---

## 1. Entity Relationship Diagram (Conceptual)

```mermaid
erDiagram
    STUDENT ||--o{ TUITION_FEE : "has"
    STUDENT ||--o{ PAYMENT : "receives"
    TUITION_FEE ||--o{ PAYMENT : "settled_by"
    PAYMENT ||--o{ OTP_CODE : "verified_by"

    STUDENT {
        uuid id PK
        string student_code UK "MSSV (e.g. 521H0001)"
        string full_name "Họ và tên"
        string email "Email sinh viên"
        string phone "Số điện thoại"
        string faculty "Khoa / Ngành"
        timestamp created_at
        timestamp updated_at
    }

    TUITION_FEE {
        uuid id PK
        uuid student_id FK
        string semester "Học kỳ (e.g. HK1_2026_2027)"
        decimal amount "Số tiền học phí"
        string status "UNPAID | PAID"
        timestamp created_at
        timestamp updated_at
    }

    PAYMENT {
        uuid id PK
        string account_id "ID tài khoản ngân hàng người nộp"
        uuid student_id FK
        uuid tuition_fee_id FK
        decimal amount "Số tiền thanh toán"
        string status "PENDING | COMPLETED | FAILED | EXPIRED"
        string transaction_reference UK "Mã giao dịch duy nhất"
        string payer_email "Email người nộp tiền nhận OTP"
        string failure_reason "Lý do thất bại nếu có"
        timestamp created_at
        timestamp updated_at
    }

    OTP_CODE {
        uuid id PK
        uuid payment_id FK
        string code "Mã OTP 6 số"
        timestamp expires_at "Thời hạn 5 phút"
        boolean is_used "Đã sử dụng hay chưa"
        int attempts "Số lần thử sai (max 5)"
        timestamp created_at
    }
```

---

## 2. Prisma Schema Definition

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum TuitionStatus {
  UNPAID
  PAID
}

enum PaymentStatus {
  PENDING
  COMPLETED
  FAILED
  EXPIRED
}

model Student {
  id          String       @id @default(uuid()) @db.Uuid
  studentCode String       @unique @map("student_code") @db.VarChar(20)
  fullName    String       @map("full_name") @db.VarChar(100)
  email       String       @db.VarChar(100)
  phone       String       @db.VarChar(20)
  faculty     String       @db.VarChar(100)
  createdAt   DateTime     @default(now()) @map("created_at")
  updatedAt   DateTime     @updatedAt @map("updated_at")

  tuitionFees TuitionFee[]
  payments    Payment[]

  @@map("students")
}

model TuitionFee {
  id        String        @id @default(uuid()) @db.Uuid
  studentId String        @map("student_id") @db.Uuid
  semester  String        @db.VarChar(50)
  amount    Decimal       @db.Decimal(12, 2)
  status    TuitionStatus @default(UNPAID)
  createdAt DateTime      @default(now()) @map("created_at")
  updatedAt DateTime      @updatedAt @map("updated_at")

  student  Student   @relation(fields: [studentId], references: [id])
  payments Payment[]

  @@index([studentId, status])
  @@map("tuition_fees")
}

model Payment {
  id                   String        @id @default(uuid()) @db.Uuid
  accountId            String        @map("account_id") @db.VarChar(50)
  studentId            String        @map("student_id") @db.Uuid
  tuitionFeeId         String        @map("tuition_fee_id") @db.Uuid
  amount               Decimal       @db.Decimal(12, 2)
  status               PaymentStatus @default(PENDING)
  transactionReference String        @unique @map("transaction_reference") @db.VarChar(50)
  payerEmail           String        @map("payer_email") @db.VarChar(100)
  failureReason        String?       @map("failure_reason") @db.Text
  createdAt            DateTime      @default(now()) @map("created_at")
  updatedAt            DateTime      @updatedAt @map("updated_at")

  student    Student    @relation(fields: [studentId], references: [id])
  tuitionFee TuitionFee @relation(fields: [tuitionFeeId], references: [id])
  otpCodes   OtpCode[]

  @@index([accountId])
  @@index([tuitionFeeId, status])
  @@map("payments")
}

model OtpCode {
  id        String   @id @default(uuid()) @db.Uuid
  paymentId String   @map("payment_id") @db.Uuid
  code      String   @db.VarChar(10)
  expiresAt DateTime @map("expires_at")
  isUsed    Boolean  @default(false) @map("is_used")
  attempts  Int      @default(0)
  createdAt DateTime @default(now()) @map("created_at")

  payment Payment @relation(fields: [paymentId], references: [id], onDelete: Cascade)

  @@index([paymentId, isUsed])
  @@map("otp_codes")
}
```

---

## 3. Payment State Machine

```
      [Khởi tạo Payment]
              │
              ▼
        ┌───────────┐
        │  PENDING  │ ◄─── Sinh OTP (Hạn 5 phút)
        └─────┬─────┘
              │
      ┌───────┴────────────────────────┐
      │                                │
[Nhập đúng OTP & DB Lock Ok]   [Quá 5 phút / Sai 5 lần / Hết tiền / Đã nộp]
      │                                │
      ▼                                ▼
┌───────────┐                    ┌───────────┐
│ COMPLETED │                    │  FAILED / │
└───────────┘                    │  EXPIRED  │
                                 └───────────┘
```

