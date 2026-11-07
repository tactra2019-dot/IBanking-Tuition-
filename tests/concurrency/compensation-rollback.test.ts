import assert from 'node:assert';
import { accountsStore, app as accountApp, resetMockAccounts } from '../../src/mock-account-service';
import { app as paymentApp } from '../../src/payment-service';
import { setFaultInjectionHook } from '../../src/payment-service/services/payment.service';
import { prisma } from '../../src/shared/prisma';

export async function runCompensationRollbackTest() {
  console.log('\n--- [CONSISTENCY 3] LỖI DB SAU KHI TRỪ TIỀN -> ROLLBACK HỌC PHÍ & BÙ TRỪ HOÀN TIỀN ---');
  resetMockAccounts();

  const s1 = await prisma.student.findUniqueOrThrow({ where: { studentCode: '521H0001' }, include: { tuitionFees: true } });
  const t1 = s1.tuitionFees[0];
  await prisma.otpCode.deleteMany({ where: { payment: { tuitionFeeId: t1.id } } });
  await prisma.payment.deleteMany({ where: { tuitionFeeId: t1.id } });
  await prisma.tuitionFee.update({ where: { id: t1.id }, data: { status: 'UNPAID' } });

  const accServer = accountApp.listen(0);
  const accPort = (accServer.address() as any).port;
  process.env.ACCOUNT_SERVICE_URL = `http://localhost:${accPort}/api`;

  const payServer = paymentApp.listen(0);
  const payPort = (payServer.address() as any).port;
  const base = `http://localhost:${payPort}/api`;

  try {
    const initialBalance = accountsStore.get('ACC-001')!.balance;

    const rIntent = await fetch(`${base}/payments/create-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: 'ACC-001', studentCode: '521H0001', tuitionFeeId: t1.id, payerEmail: 'phu@tdtu.edu.vn' }),
    });
    const paymentId = ((await rIntent.json()) as any).data.paymentId;
    const otp = (await prisma.otpCode.findFirstOrThrow({ where: { paymentId, isUsed: false } })).code;

    // Inject simulated DB failure right AFTER money is debited and BEFORE tuition is marked PAID
    setFaultInjectionHook(() => {
      throw new Error('SIMULATED_DB_CRASH_AFTER_DEBIT');
    });

    const rConfirm = await fetch(`${base}/payments/confirm-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId, otpCode: otp }),
    });

    assert.strictEqual(rConfirm.status, 500);

    // 1. Account balance MUST be refunded back to original 50,000,000 VND
    assert.strictEqual(accountsStore.get('ACC-001')!.balance, initialBalance, 'Số dư phải được hoàn trả 100% qua cơ chế bù trừ');

    // 2. TuitionFee MUST remain UNPAID (DB transaction rolled back)
    const afterTuition = await prisma.tuitionFee.findUniqueOrThrow({ where: { id: t1.id } });
    assert.strictEqual(afterTuition.status, 'UNPAID', 'Học phí phải giữ nguyên trạng thái UNPAID');

    // 3. Payment MUST be marked FAILED
    const afterPayment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    assert.strictEqual(afterPayment.status, 'FAILED', 'Giao dịch lỗi phải chuyển sang FAILED');

    console.log('✓ Compensation & Rollback PASS: Lỗi sau trừ tiền -> Hoàn tiền 100%, học phí vẫn UNPAID, payment FAILED.');
  } finally {
    setFaultInjectionHook(null);
    await prisma.otpCode.deleteMany({ where: { payment: { tuitionFeeId: t1.id } } });
    await prisma.payment.deleteMany({ where: { tuitionFeeId: t1.id } });
    await prisma.tuitionFee.update({ where: { id: t1.id }, data: { status: 'UNPAID' } });
    payServer.close();
    accServer.close();
  }
}

if (require.main === module) {
  runCompensationRollbackTest()
    .then(() => prisma.$disconnect())
    .catch(async (err) => {
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });
}

