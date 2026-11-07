import { prisma } from '../../shared/prisma';
import { isUuid } from '../../shared/response';

export const studentService = {
  async findByCode(studentCode: string) {
    return prisma.student.findUnique({
      where: { studentCode: studentCode.trim().toUpperCase() },
    });
  },

  async getTuitionByStudentCode(studentCode: string) {
    const fee = await prisma.tuitionFee.findFirst({
      where: { student: { studentCode: studentCode.trim().toUpperCase() } },
      include: { student: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!fee) return null;

    return {
      id: fee.id,
      studentId: fee.studentId,
      studentCode: fee.student.studentCode,
      studentName: fee.student.fullName,
      faculty: fee.student.faculty,
      semester: fee.semester,
      amount: Number(fee.amount),
      status: fee.status,
    };
  },

  async markTuitionPaid(id: string) {
    if (!isUuid(id)) return { error: 'NOT_FOUND' as const };

    return prisma.$transaction(async (tx) => {
      const [locked]: any[] = await tx.$queryRaw`
        SELECT id, status FROM "tuition_fees" WHERE "id" = ${id}::uuid FOR UPDATE
      `;
      if (!locked) return { error: 'NOT_FOUND' as const };
      if (locked.status === 'PAID') return { error: 'ALREADY_PAID' as const };

      const updated = await tx.tuitionFee.update({
        where: { id },
        data: { status: 'PAID' },
      });
      return { data: { ...updated, amount: Number(updated.amount) } };
    });
  },
};
