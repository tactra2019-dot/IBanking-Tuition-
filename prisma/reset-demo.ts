import 'dotenv/config';
import { Prisma } from '@ibanking/db';
import { prisma } from '../src/shared/prisma';

const accounts = [
  { username: 'demo1', accountId: 'ACC-001', openingBalance: 50_000_000n },
  { username: 'demo2', accountId: 'ACC-002', openingBalance: 30_000_000n },
] as const;
const tuition = [
  ['521H9001', 7_000_000], ['521H9002', 5_000_000], ['521H9003', 12_000_000],
  ['521H9004', 7_000_000], ['521H9005', 8_000_000], ['521H9006', 9_000_000],
] as const;
const semester = 'HK1_2026_2027';

async function main() {
  const schema = new URL(process.env.DATABASE_URL || '').searchParams.get('schema') || '';
  if (!/^micro_demo_[a-z0-9_]{1,35}$/.test(schema) || process.env.DEMO_RESET_SCHEMA !== schema) {
    throw new Error('Chỉ reset schema micro_demo_* khi DEMO_RESET_SCHEMA khớp chính xác tên schema');
  }
  const apply = process.argv.includes('--apply');
  if (apply && process.env.DEMO_RESET_SERVICES_STOPPED !== 'YES') {
    throw new Error('Dừng Gateway, Auth, Account, Student, Payment rồi đặt DEMO_RESET_SERVICES_STOPPED=YES');
  }

  const result = await prisma.$transaction(async tx => {
    const users = await tx.user.findMany({
      where: { username: { in: accounts.map(a => a.username) } },
      select: { id: true, username: true },
    });
    const accountRows = await tx.account.findMany({
      where: { id: { in: accounts.map(a => a.accountId) } },
      select: { id: true, userId: true, balance: true },
    });
    for (const expected of accounts) {
      const user = users.find(u => u.username === expected.username);
      const account = accountRows.find(a => a.id === expected.accountId);
      if (!user || !account || account.userId !== user.id) {
        throw new Error(`Thiếu hoặc sai liên kết ${expected.username}/${expected.accountId}; không reset`);
      }
    }

    const students = await tx.student.findMany({
      where: { studentCode: { in: tuition.map(([code]) => code) } },
      select: { studentCode: true, tuitionFees: { select: { id: true, semester: true, amount: true, status: true, reservedPaymentId: true } } },
    });
    for (const [code, amount] of tuition) {
      const student = students.find(s => s.studentCode === code);
      if (!student || student.tuitionFees.length !== 1 || student.tuitionFees[0].semester !== semester ||
          Number(student.tuitionFees[0].amount) !== amount) {
        throw new Error(`Dữ liệu học phí ${code} khác seed; không reset`);
      }
    }
    const accountIds = accounts.map(a => a.accountId);
    const feeIds = students.map(s => s.tuitionFees[0].id);
    const payments = await tx.payment.findMany({
      where: { OR: [{ accountId: { in: accountIds } }, { tuitionFeeId: { in: feeIds } }] },
      select: { id: true, accountId: true, tuitionFeeId: true, status: true },
    });
    if (payments.some(p => !accountIds.includes(p.accountId as typeof accountIds[number]) ||
        !feeIds.includes(p.tuitionFeeId) || !['COMPLETED', 'FAILED', 'EXPIRED'].includes(p.status))) {
      throw new Error('Có giao dịch đang xử lý hoặc giao dịch liên quan dữ liệu ngoài seed; không reset');
    }
    const paymentIds = payments.map(p => p.id);
    for (const student of students) {
      const fee = student.tuitionFees[0];
      const completed = payments.filter(p => p.tuitionFeeId === fee.id && p.status === 'COMPLETED');
      if ((fee.status === 'PAID' && (completed.length !== 1 || fee.reservedPaymentId !== completed[0].id)) ||
          (fee.status === 'UNPAID' && (completed.length !== 0 || fee.reservedPaymentId !== null))) {
        throw new Error(`Trạng thái học phí ${student.studentCode} không khớp giao dịch; không reset`);
      }
    }
    const debits = await tx.accountDebit.findMany({
      where: { accountId: { in: accountIds } }, select: { paymentId: true },
    });
    if (debits.some(d => !paymentIds.includes(d.paymentId))) {
      throw new Error('Ledger có debit không khớp giao dịch demo; không reset');
    }

    if (apply) {
      await tx.otpCode.deleteMany({ where: { paymentId: { in: paymentIds } } });
      await tx.accountDebit.deleteMany({ where: { accountId: { in: accountIds } } });
      await tx.payment.deleteMany({ where: { id: { in: paymentIds } } });
      await tx.tuitionFee.updateMany({
        where: { id: { in: feeIds } }, data: { status: 'UNPAID', reservedPaymentId: null },
      });
      for (const account of accounts) {
        await tx.account.update({ where: { id: account.accountId }, data: { balance: account.openingBalance } });
      }
    }
    return { accounts: accountRows.map(a => `${a.id}: ${a.balance} -> ${accounts.find(x => x.accountId === a.id)!.openingBalance}`),
      tuition: students.map(s => `${s.studentCode}: ${s.tuitionFees[0].status} -> UNPAID`),
      payments: payments.length, debits: debits.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });

  console.log(`Schema: ${schema}`);
  console.log(`Tài khoản: ${result.accounts.join('; ')}`);
  console.log(`Học phí: ${result.tuition.join('; ')}`);
  console.log(`Giao dịch sẽ xóa: ${result.payments}; debit ledger sẽ xóa: ${result.debits}`);
  console.log(apply ? 'Đã reset dữ liệu demo.' : 'Chỉ xem trước. Thêm --apply để thực hiện.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Reset thất bại');
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
