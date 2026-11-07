import assert from 'node:assert';
import { accountsStore, app as accountApp, resetMockAccounts } from '../../src/mock-account-service';
import { app as paymentApp } from '../../src/payment-service';
import { prisma } from '../../src/shared/prisma';

export async function runDoubleSpendingTest() {
  console.log('\n--- [CONCURRENCY 2] MỘT TÀI KHOẢN GỬI NHIỀU GIAO DỊCH ĐỒNG THỜI VƯỢT SỐ DƯ ---');
  resetMockAccounts();
  // Set ACC-10M to 20,000,000 VND so it can afford EITHER 521H0001 (12.5M) OR 521H0002 (10.8M), NOT BOTH (23.3M)
  accountsStore.set('ACC-10M', {
    accountId: 'ACC-10M',
    fullName: 'Phạm Hai Mươi Triệu',
    email: '20m@tdtu.edu.vn',
    phone: '0909777888',
    balance: 20000000,
  });

  const s1 = await prisma.student.findUniqueOrThrow({ where: { studentCode: '521H0001' }, include: { tuitionFees: true } });
  const s2 = await prisma.student.findUniqueOrThrow({ where: { studentCode: '521H0002' }, include: { tuitionFees: true } });
  const t1 = s1.tuitionFees[0]; // 12.5M
  const t2 = s2.tuitionFees[0]; // 10.8M

  for (const t of [t1, t2]) {
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
    // Both create-intent calls pass pre-check because 20M >= 12.5M and 20M >= 10.8M
    const [r1, r2] = await Promise.all([
      fetch(`${base}/payments/create-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: 'ACC-10M', studentCode: '521H0001', tuitionFeeId: t1.id, payerEmail: '20m@tdtu.edu.vn' }),
      }),
      fetch(`${base}/payments/create-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: 'ACC-10M', studentCode: '521H0002', tuitionFeeId: t2.id, payerEmail: '20m@tdtu.edu.vn' }),
      }),
    ]);
    assert.strictEqual(r1.status, 201);
    assert.strictEqual(r2.status, 201);

    const p1Id = ((await r1.json()) as any).data.paymentId;
    const p2Id = ((await r2.json()) as any).data.paymentId;
    const otp1 = (await prisma.otpCode.findFirstOrThrow({ where: { paymentId: p1Id, isUsed: false } })).code;
    const otp2 = (await prisma.otpCode.findFirstOrThrow({ where: { paymentId: p2Id, isUsed: false } })).code;

    // Fire both confirm-otp simultaneously
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

    assert.deepStrictEqual([c1.status, c2.status].sort(), [200, 402], 'Chỉ 1 giao dịch 200, giao dịch kia 402 (thiếu số dư)');
    const remaining = accountsStore.get('ACC-10M')!.balance;
    assert.ok(remaining >= 0, 'Số dư không bao giờ bị âm');
    assert.ok(remaining === 7500000 || remaining === 9200000, `Số dư cuối phải khớp đúng giao dịch thành công (${remaining})`);
    console.log(`✓ Double-spending PASS: Số dư cuối ${remaining.toLocaleString()} VNĐ (>= 0), chặn chi tiêu vượt số dư.`);
  } finally {
    for (const t of [t1, t2]) {
      await prisma.otpCode.deleteMany({ where: { payment: { tuitionFeeId: t.id } } });
      await prisma.payment.deleteMany({ where: { tuitionFeeId: t.id } });
      await prisma.tuitionFee.update({ where: { id: t.id }, data: { status: 'UNPAID' } });
    }
    payServer.close();
    accServer.close();
  }
}

if (require.main === module) {
  runDoubleSpendingTest()
    .then(() => prisma.$disconnect())
    .catch(async (err) => {
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });
}

