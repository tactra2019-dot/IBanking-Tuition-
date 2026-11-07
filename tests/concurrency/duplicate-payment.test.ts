import assert from 'node:assert';
import { accountsStore, app as accountApp, resetMockAccounts } from '../../src/mock-account-service';
import { app as paymentApp } from '../../src/payment-service';
import { prisma } from '../../src/shared/prisma';

export async function runDuplicatePaymentTest() {
  console.log('\n--- [CONCURRENCY 1] HAI NGƯỜI CÙNG ĐÓNG 1 MSSV + DOUBLE-CLICK CÙNG PAYMENT ---');
  resetMockAccounts();

  const s4 = await prisma.student.findUniqueOrThrow({ where: { studentCode: '521H0004' }, include: { tuitionFees: true } });
  const s5 = await prisma.student.findUniqueOrThrow({ where: { studentCode: '521H0005' }, include: { tuitionFees: true } });
  const t4 = s4.tuitionFees[0];
  const t5 = s5.tuitionFees[0];

  for (const t of [t4, t5]) {
    await prisma.otpCode.deleteMany({ where: { payment: { tuitionFeeId: t.id } } });
    await prisma.payment.deleteMany({ where: { tuitionFeeId: t.id } });
    await prisma.tuitionFee.update({ where: { id: t.id }, data: { status: 'UNPAID' } });
  }

  const accServer = accountApp.listen(0);
  const accPort = (accServer.address() as any).port;
  process.env.ACCOUNT_SERVICE_URL = `http://localhost:${accPort}/api`;

  const payServer = paymentApp.listen(0);
  const payPort = (payServer.address() as any).port;
  const base = `http://localhost:${payPort}/api`;

  try {
    // CASE A: 2 different accounts (ACC-001 & ACC-002) concurrently pay for 521H0004
    const [r1, r2] = await Promise.all([
      fetch(`${base}/payments/create-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: 'ACC-001', studentCode: '521H0004', tuitionFeeId: t4.id, payerEmail: 'u1@tdtu.edu.vn' }),
      }),
      fetch(`${base}/payments/create-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: 'ACC-002', studentCode: '521H0004', tuitionFeeId: t4.id, payerEmail: 'u2@tdtu.edu.vn' }),
      }),
    ]);
    const p1Id = ((await r1.json()) as any).data.paymentId;
    const p2Id = ((await r2.json()) as any).data.paymentId;
    const otp1 = (await prisma.otpCode.findFirstOrThrow({ where: { paymentId: p1Id, isUsed: false } })).code;
    const otp2 = (await prisma.otpCode.findFirstOrThrow({ where: { paymentId: p2Id, isUsed: false } })).code;

    const initAcc1 = accountsStore.get('ACC-001')!.balance;
    const initAcc2 = accountsStore.get('ACC-002')!.balance;

    const [c1, c2] = await Promise.all([
      fetch(`${base}/payments/confirm-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: p1Id, otpCode: otp1 }),
      }),
      fetch(`${base}/payments/confirm-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: p2Id, otpCode: otp2 }),
      }),
    ]);

    assert.deepStrictEqual([c1.status, c2.status].sort(), [200, 409], '1 thành công (200), 1 bị từ chối (409)');

    const feeAmount = Number(t4.amount);
    if (c1.status === 200) {
      assert.strictEqual(accountsStore.get('ACC-001')!.balance, initAcc1 - feeAmount);
      assert.strictEqual(accountsStore.get('ACC-002')!.balance, initAcc2, 'Người bị từ chối không mất tiền');
    } else {
      assert.strictEqual(accountsStore.get('ACC-002')!.balance, initAcc2 - feeAmount);
      assert.strictEqual(accountsStore.get('ACC-001')!.balance, initAcc1, 'Người bị từ chối không mất tiền');
    }

    const completedCount = await prisma.payment.count({ where: { tuitionFeeId: t4.id, status: 'COMPLETED' } });
    assert.strictEqual(completedCount, 1);
    console.log('✓ Case A PASS: 2 người cùng đóng 1 MSSV -> 1 COMPLETED, 1 FAILED (bảo toàn tiền).');

    // CASE B: Double-click same paymentId + same OTP concurrently for 521H0005
    const rDouble = await fetch(`${base}/payments/create-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: 'ACC-001', studentCode: '521H0005', tuitionFeeId: t5.id, payerEmail: 'u1@tdtu.edu.vn' }),
    });
    const pDoubleId = ((await rDouble.json()) as any).data.paymentId;
    const otpDouble = (await prisma.otpCode.findFirstOrThrow({ where: { paymentId: pDoubleId, isUsed: false } })).code;
    const balBeforeDouble = accountsStore.get('ACC-001')!.balance;

    const [d1, d2] = await Promise.all([
      fetch(`${base}/payments/confirm-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: pDoubleId, otpCode: otpDouble }),
      }),
      fetch(`${base}/payments/confirm-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: pDoubleId, otpCode: otpDouble }),
      }),
    ]);

    assert.deepStrictEqual([d1.status, d2.status].sort(), [200, 409], 'Double-click cùng OTP chỉ 1 thành công');
    assert.strictEqual(accountsStore.get('ACC-001')!.balance, balBeforeDouble - Number(t5.amount), 'Chỉ trừ tiền đúng 1 lần');
    const finalDoublePayment = await prisma.payment.findUniqueOrThrow({ where: { id: pDoubleId } });
    assert.strictEqual(finalDoublePayment.status, 'COMPLETED', 'Trạng thái COMPLETED không bị ghi đè thành FAILED');
    console.log('✓ Case B PASS: Double-click cùng 1 giao dịch -> Trừ tiền 1 lần, giữ nguyên COMPLETED.');
  } finally {
    for (const t of [t4, t5]) {
      await prisma.otpCode.deleteMany({ where: { payment: { tuitionFeeId: t.id } } });
      await prisma.payment.deleteMany({ where: { tuitionFeeId: t.id } });
      await prisma.tuitionFee.update({ where: { id: t.id }, data: { status: 'UNPAID' } });
    }
    payServer.close();
    accServer.close();
  }
}

if (require.main === module) {
  runDuplicatePaymentTest()
    .then(() => prisma.$disconnect())
    .catch(async (err) => {
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
