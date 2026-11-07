import { prisma } from '../../src/shared/prisma';
import { runCompensationRollbackTest } from './compensation-rollback.test';
import { runDoubleSpendingTest } from './double-spending.test';
import { runDuplicatePaymentTest } from './duplicate-payment.test';

async function main() {
  await runDuplicatePaymentTest();
  await runDoubleSpendingTest();
  await runCompensationRollbackTest();
  console.log('\n=== TẤT CẢ 3 BỘ TEST CONCURRENCY & TRANSACTION CONSISTENCY ĐỀU PASS 100%! ===\n');
}

main()
  .catch((err) => {
    console.error('CONCURRENCY SUITE FAILED:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
