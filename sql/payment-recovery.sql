ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REFUND_PENDING';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REVIEW_REQUIRED';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS debit_started boolean NOT NULL DEFAULT false;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS recovery_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_sent boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_completed_payment_per_tuition
ON payments(tuition_fee_id) WHERE status = 'COMPLETED';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'payments'::regclass AND conname = 'payments_amount_vnd') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_amount_vnd CHECK (amount > 0 AND amount = trunc(amount));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'tuition_fees'::regclass AND conname = 'tuition_amount_vnd') THEN
    ALTER TABLE tuition_fees ADD CONSTRAINT tuition_amount_vnd CHECK (amount > 0 AND amount = trunc(amount));
  END IF;
END;
$$;
