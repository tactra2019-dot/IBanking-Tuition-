import assert from 'node:assert';
import { app } from '../src/student-service';
import { prisma } from '../src/shared/prisma';

async function run() {
  const server = app.listen(0);
  const { port } = server.address() as any;
  const base = `http://localhost:${port}/api`;

  try {
    // 1.Valid student
    const r1 = await fetch(`${base}/students/521H0001`);
    const b1: any = await r1.json();
    assert.strictEqual(r1.status, 200);
    assert.strictEqual(b1.data.studentCode, '521H0001');

    // 2.Tuition unpaid
    const r2 = await fetch(`${base}/tuitions/student/521H0001`);
    const b2: any = await r2.json();
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(b2.data.amount, 12500000);
    assert.strictEqual(b2.data.status, 'UNPAID');

    // 3.Tuition paid
    const r3 = await fetch(`${base}/tuitions/student/521H0003`);
    const b3: any = await r3.json();
    assert.strictEqual(r3.status, 200);
    assert.strictEqual(b3.data.status, 'PAID');

    // 4.Non-existent student
    const r4 = await fetch(`${base}/students/999X9999`);
    assert.strictEqual(r4.status, 404);

    console.log('PASS: All 4 Student Service checks succeeded!');
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

