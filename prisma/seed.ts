import { TuitionStatus } from '@prisma/client';
import { prisma } from '../src/shared/prisma';

const STUDENTS = [
  { studentCode: '521H0001', fullName: 'Nguyễn Văn An', email: '521h0001@student.tdtu.edu.vn', phone: '0901234567', faculty: 'Công nghệ thông tin', amount: 12500000, status: TuitionStatus.UNPAID },
  { studentCode: '521H0002', fullName: 'Trần Thị Bích', email: '521h0002@student.tdtu.edu.vn', phone: '0912345678', faculty: 'Quản trị kinh doanh', amount: 10800000, status: TuitionStatus.UNPAID },
  { studentCode: '521H0003', fullName: 'Lê Hoàng Nam', email: '521h0003@student.tdtu.edu.vn', phone: '0923456789', faculty: 'Tài chính - Ngân hàng', amount: 14000000, status: TuitionStatus.PAID },
  { studentCode: '521H0004', fullName: 'Phạm Minh Đức', email: '521h0004@student.tdtu.edu.vn', phone: '0934567890', faculty: 'Kỹ thuật phần mềm', amount: 15200000, status: TuitionStatus.UNPAID },
  { studentCode: '521H0005', fullName: 'Đặng Thu Hà', email: '521h0005@student.tdtu.edu.vn', phone: '0945678901', faculty: 'Ngôn ngữ Anh', amount: 9500000, status: TuitionStatus.UNPAID },
];

async function main() {
  // Ensure DB-level partial unique index against duplicate COMPLETED payment per tuition fee
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_unique_completed_payment_per_tuition"
    ON "payments"("tuition_fee_id") WHERE "status" = 'COMPLETED'
  `);

  await prisma.otpCode.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.tuitionFee.deleteMany();
  await prisma.student.deleteMany();

  for (const { amount, status, ...student } of STUDENTS) {
    await prisma.student.create({
      data: {
        ...student,
        tuitionFees: { create: { semester: 'HK1_2026_2027', amount, status } },
      },
    });
    console.log(`+ ${student.studentCode} - ${student.fullName}: ${amount.toLocaleString()} VND (${status})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
