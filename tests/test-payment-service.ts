import assert from 'node:assert';
import { app as accountApp, resetMockAccounts } from '../src/mock-account-service';
import { app as paymentApp } from '../src/payment-service';
import { prisma } from '../src/shared/prisma';

async function run() {
  resetMockAccounts();

  const student = await prisma.student.findUniqueOrThrow({
    where: { studentCode: '521H0001' },
    include: { tuitionFees: true },
  });
  const tuition = student.tuitionFees[0];
  await prisma.otpCode.deleteMany({ where: { payment: { tuitionFeeId: tuition.id } } });
  await prisma.payment.deleteMany({ where: { tuitionFeeId: tuition.id } });
  await prisma.tuitionFee.update({ where: { id: tuition.id }, data: { status: 'UNPAID' } });

  const accServer = accountApp.listen(0);
  const accPort = (accServer.address() as any).port;
  process.env.ACCOUNT_SERVICE_URL = `http://localhost:${accPort}/api`;

  const payServer = paymentApp.listen(0);
  const { port } = payServer.address() as any;
  const base = `http://localhost:${port}/api`;

  try {
    // 1. Reject invalid UUID & invalid email with 400 (never 500)
    const rBadUuid = await fetch(`${base}/payments/not-a-uuid`);
    assert.strictEqual(rBadUuid.status, 404);

    const rBadEmail = await fetch(`${base}/payments/create-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: 'ACC-001', studentCode: '521H0001', tuitionFeeId: tuition.id, payerEmail: 'bad-email' }),
    });
    assert.strictEqual(rBadEmail.status, 400);

    // 2. Reject partial payment
    const rPartial = await fetch(`${base}/payments/create-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: 'ACC-001', studentCode: '521H0001', tuitionFeeId: tuition.id, payerEmail: 'phu@tdtu.edu.vn', amount: 5000000 }),
    });
    assert.strictEqual(rPartial.status, 400);

    // 3. Reject insufficient balance (ACC-LOW has 5M, tuition is 12.5M)
    const rLow = await fetch(`${base}/payments/create-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: 'ACC-LOW', studentCode: '521H0001', tuitionFeeId: tuition.id, payerEmail: 'low@tdtu.edu.vn' }),
    });
    assert.strictEqual(rLow.status, 402);

    // 4. Reject when Account Service is offline -> 503 (never free pass!)
    process.env.ACCOUNT_SERVICE_URL = 'http://localhost:59999/api';
    const rOffline = await fetch(`${base}/payments/create-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: 'ACC-001', studentCode: '521H0001', tuitionFeeId: tuition.id, payerEmail: 'phu@tdtu.edu.vn' }),
    });
    assert.strictEqual(rOffline.status, 503);
    process.env.ACCOUNT_SERVICE_URL = `http://localhost:${accPort}/api`;

    // 5. Expired OTP transitions payment to EXPIRED
    const rExpIntent = await fetch(`${base}/payments/create-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: 'ACC-001', studentCode: '521H0001', tuitionFeeId: tuition.id, payerEmail: 'phu@tdtu.edu.vn' }),
    });
    const expPaymentId = ((await rExpIntent.json()) as any).data.paymentId;
    const expOtp = await prisma.otpCode.findFirstOrThrow({ where: { paymentId: expPaymentId } });
    await prisma.otpCode.update({ where: { id: expOtp.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const rExpired = await fetch(`${base}/payments/confirm-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId: expPaymentId, otpCode: expOtp.code }),
    });
    assert.strictEqual(rExpired.status, 400);
    const expiredPay = await prisma.payment.findUniqueOrThrow({ where: { id: expPaymentId } });
    assert.strictEqual(expiredPay.status, 'EXPIRED');

    // 6. 5 wrong OTP attempts transitions payment to FAILED
    const rBruteIntent = await fetch(`${base}/payments/create-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: 'ACC-001', studentCode: '521H0001', tuitionFeeId: tuition.id, payerEmail: 'phu@tdtu.edu.vn' }),
    });
    const brutePaymentId = ((await rBruteIntent.json()) as any).data.paymentId;
    for (let i = 0; i < 5; i++) {
      const resWrong = await fetch(`${base}/payments/confirm-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: brutePaymentId, otpCode: '000000' }),
      });
      assert.strictEqual(resWrong.status, 400);
    }
    const brutePay = await prisma.payment.findUniqueOrThrow({ where: { id: brutePaymentId } });
    assert.strictEqual(brutePay.status, 'FAILED');

    // 7. Full happy path: Create intent -> Confirm OTP -> COMPLETED + PAID -> Reuse OTP rejected (409)
    const rIntent = await fetch(`${base}/payments/create-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: 'ACC-001', studentCode: '521H0001', tuitionFeeId: tuition.id, payerEmail: 'phu@tdtu.edu.vn' }),
    });
    const paymentId = ((await rIntent.json()) as any).data.paymentId;
    const otpRecord = await prisma.otpCode.findFirstOrThrow({ where: { paymentId, isUsed: false } });

    const rConfirm = await fetch(`${base}/payments/confirm-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId, otpCode: otpRecord.code }),
    });
    const bConfirm: any = await rConfirm.json();
    assert.strictEqual(rConfirm.status, 200);
    assert.strictEqual(bConfirm.data.status, 'COMPLETED');

    const updatedTuition = await prisma.tuitionFee.findUniqueOrThrow({ where: { id: tuition.id } });
    assert.strictEqual(updatedTuition.status, 'PAID');

    const rReuse = await fetch(`${base}/payments/confirm-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId, otpCode: otpRecord.code }),
    });
    assert.strictEqual(rReuse.status, 409);

    const rHistory = await fetch(`${base}/payments/account/ACC-001`);
    const bHistory: any = await rHistory.json();
    assert.strictEqual(rHistory.status, 200);
    assert.ok(bHistory.data.some((p: any) => p.id === paymentId && p.status === 'COMPLETED'));

    console.log('PASS: All 10 Payment & OTP Service edge-case checks succeeded!');
  } finally {
    await prisma.otpCode.deleteMany({ where: { payment: { tuitionFeeId: tuition.id } } });
    await prisma.payment.deleteMany({ where: { tuitionFeeId: tuition.id } });
    await prisma.tuitionFee.update({ where: { id: tuition.id }, data: { status: 'UNPAID' } });

    payServer.close();
    accServer.close();
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
