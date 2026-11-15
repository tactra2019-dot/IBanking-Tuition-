import { prisma } from '../../shared/prisma';


export const studentService = {
  async findByCode(studentCode: string) {
    return prisma.student.findUnique({
      where: { studentCode: studentCode.trim().toUpperCase() },
      select: { studentCode: true, fullName: true, faculty: true },
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
};
