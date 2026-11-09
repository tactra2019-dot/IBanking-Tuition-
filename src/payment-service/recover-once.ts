import 'dotenv/config';
import { prisma } from '../shared/prisma';
import { deliverReceipts, recoverPendingPayments } from './services/recovery.service';

recoverPendingPayments().then(deliverReceipts).catch(() => {
  console.error('Đối soát chưa hoàn tất');
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
