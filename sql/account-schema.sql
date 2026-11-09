BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username varchar(80) NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name varchar(100) NOT NULL,
  email varchar(100) NOT NULL,
  phone varchar(20) NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id varchar(50) PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  balance bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS account_debits (
  payment_id uuid PRIMARY KEY,
  account_id varchar(50) NOT NULL REFERENCES accounts(id),
  amount bigint NOT NULL,
  remaining_balance bigint,
  refunded_balance bigint
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'accounts'::regclass AND conname = 'accounts_balance_range'
  ) THEN
    ALTER TABLE accounts ADD CONSTRAINT accounts_balance_range CHECK (balance BETWEEN 0 AND 999999999999);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'account_debits'::regclass AND conname = 'account_debits_valid_amounts'
  ) THEN
    ALTER TABLE account_debits ADD CONSTRAINT account_debits_valid_amounts CHECK (
      amount BETWEEN 1 AND 999999999999 AND
      (remaining_balance IS NULL OR remaining_balance BETWEEN 0 AND 999999999999) AND
      (refunded_balance IS NULL OR (remaining_balance IS NOT NULL AND refunded_balance BETWEEN 0 AND 999999999999))
    );
  END IF;
END;
$$;

COMMIT;

