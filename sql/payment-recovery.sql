ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REFUND_PENDING';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_sent boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_completed_payment_per_tuition
ON payments(tuition_fee_id) WHERE status = 'COMPLETED';
