-- ====================================================================
-- iBanking Database Schema (TDTU Tuition Payment Services)
-- Synchronized 100% with prisma/schema.prisma + PostgreSQL Hard Guards
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
    CREATE TYPE "TuitionStatus" AS ENUM ('UNPAID', 'PAID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "students" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "student_code" VARCHAR(20) NOT NULL UNIQUE,
    "full_name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "faculty" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "tuition_fees" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
    "semester" VARCHAR(50) NOT NULL,
    "amount" DECIMAL(12, 2) NOT NULL CHECK ("amount" > 0),
    "status" "TuitionStatus" NOT NULL DEFAULT 'UNPAID',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tuition_fees_student_id_semester_key" UNIQUE ("student_id", "semester")
);

CREATE INDEX IF NOT EXISTS "tuition_fees_student_id_status_idx" ON "tuition_fees"("student_id", "status");

CREATE TABLE IF NOT EXISTS "payments" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "account_id" VARCHAR(50) NOT NULL,
    "student_id" UUID NOT NULL REFERENCES "students"("id") ON DELETE RESTRICT,
    "tuition_fee_id" UUID NOT NULL REFERENCES "tuition_fees"("id") ON DELETE RESTRICT,
    "amount" DECIMAL(12, 2) NOT NULL CHECK ("amount" > 0),
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "transaction_reference" VARCHAR(50) NOT NULL UNIQUE,
    "payer_email" VARCHAR(100) NOT NULL,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "payments_account_id_idx" ON "payments"("account_id");
CREATE INDEX IF NOT EXISTS "payments_tuition_fee_id_status_idx" ON "payments"("tuition_fee_id", "status");

-- Hard DB-level guard: At most ONE 'COMPLETED' payment per tuition_fee_id
CREATE UNIQUE INDEX IF NOT EXISTS "idx_unique_completed_payment_per_tuition"
    ON "payments"("tuition_fee_id") WHERE "status" = 'COMPLETED';

CREATE TABLE IF NOT EXISTS "otp_codes" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL REFERENCES "payments"("id") ON DELETE CASCADE,
    "code" VARCHAR(10) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "is_used" BOOLEAN NOT NULL DEFAULT FALSE,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "otp_codes_code_is_used_expires_at_idx" ON "otp_codes"("code", "is_used", "expires_at");
CREATE INDEX IF NOT EXISTS "otp_codes_payment_id_is_used_idx" ON "otp_codes"("payment_id", "is_used");
