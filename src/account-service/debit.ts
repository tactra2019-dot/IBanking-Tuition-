import { Prisma } from '@prisma/client';
import { prisma } from '../shared/prisma';

export interface DebitInput {
  paymentId: string;
  accountId: string;
  amount: number;
}

export class DebitError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) {
    super(message);
  }
}

type Debit = {
  account_id: string;
  amount: bigint;
  remaining_balance: bigint | null;
  refunded_balance: bigint | null;
};

export async function changeBalance(
  { paymentId, accountId, amount }: DebitInput,
  operation: 'debit' | 'refund',
  afterBalanceUpdate?: () => void,
) {
  const money = BigInt(amount);
  return prisma.$transaction(async (tx) => {
    const [account] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM accounts WHERE id = ${accountId}`;
    if (!account) throw new DebitError('ACCOUNT_NOT_FOUND', 404, 'Không tìm thấy tài khoản');

    // Khóa chính payment_id phân xử các request đến đồng thời, kể cả khi khác tài khoản.
    const inserted = operation === 'debit' && await tx.$executeRaw`
      INSERT INTO account_debits (payment_id, account_id, amount)
      VALUES (${paymentId}::uuid, ${accountId}, ${money})
      ON CONFLICT (payment_id) DO NOTHING
    `;

    const [entry] = await tx.$queryRaw<Debit[]>`
      SELECT account_id, amount, remaining_balance, refunded_balance
      FROM account_debits WHERE payment_id = ${paymentId}::uuid FOR UPDATE
    `;
    if (!entry) throw new DebitError('DEBIT_NOT_FOUND', 404, 'Chưa có giao dịch ghi nợ');
    if (entry.account_id !== accountId || entry.amount !== money) {
      throw new DebitError('PAYMENT_CONFLICT', 409, 'paymentId đã dùng với tài khoản hoặc số tiền khác');
    }

    if (operation === 'debit') {
      if (entry.refunded_balance !== null) {
        throw new DebitError('DEBIT_REFUNDED', 409, 'Giao dịch đã được hoàn tiền');
      }
      if (!inserted) return entry.remaining_balance;

      const [updated] = await tx.$queryRaw<{ balance: bigint }[]>`
        UPDATE accounts SET balance = balance - ${money}
        WHERE id = ${accountId} AND balance >= ${money} RETURNING balance
      `;
      // Giữ kết quả từ chối để retry cùng paymentId luôn nhất quán.
      if (!updated) return null;
      afterBalanceUpdate?.();
      await tx.$executeRaw`
        UPDATE account_debits SET remaining_balance = ${updated.balance} WHERE payment_id = ${paymentId}::uuid
      `;
      return updated.balance;
    }

    if (entry.remaining_balance === null) {
      throw new DebitError('DEBIT_NOT_APPLIED', 409, 'Giao dịch chưa trừ tiền');
    }
    if (entry.refunded_balance !== null) return entry.refunded_balance;

    const [updated] = await tx.$queryRaw<{ balance: bigint }[]>`
      UPDATE accounts SET balance = balance + ${money} WHERE id = ${accountId} RETURNING balance
    `;
    afterBalanceUpdate?.();
    await tx.$executeRaw`
      UPDATE account_debits SET refunded_balance = ${updated.balance} WHERE payment_id = ${paymentId}::uuid
    `;
    return updated.balance;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

