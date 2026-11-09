import 'dotenv/config';
import { prisma } from '../src/shared/prisma';

async function main() {
  for (const [studentCode, amount] of [['521H9001', 7000000], ['521H9002', 5000000], ['521H9003', 12000000]] as const) {
    await prisma.student.upsert({
      where: { studentCode }, update: {},
      create: {
        studentCode, fullName: 'Sinh viên demo ' + studentCode, email: studentCode + '@ibanking.test',
        phone: '0900000000', faculty: 'CNTT',
        tuitionFees: { create: { semester: 'HK1_2026_2027', amount } },
      },
    });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
