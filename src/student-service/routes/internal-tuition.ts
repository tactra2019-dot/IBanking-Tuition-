import { Router } from 'express';
import { prisma } from '../../shared/prisma';
import { handle } from '../../shared/core-http';
import { internalAllowed } from '../../shared/internal';
import { isUuid, sendError, sendSuccess } from '../../shared/response';

export const internalTuition = Router();
internalTuition.use((req, res, next) => {
  if (!internalAllowed(req, 'STUDENT_SERVICE_TOKEN')) return sendError(res, 'Thiếu xác thực dịch vụ', 401);
  next();
});
internalTuition.get('/:id', handle(async (req, res) => {
  const id = String(req.params.id);
  if (!isUuid(id)) return sendError(res, 'ID học phí không hợp lệ', 400);
  const fee = await prisma.tuitionFee.findUnique({ where: { id }, include: { student: true } });
  if (!fee) return sendError(res, 'Không tìm thấy học phí', 404);
  return sendSuccess(res, {
    id: fee.id, studentId: fee.studentId, studentCode: fee.student.studentCode, studentName: fee.student.fullName,
    semester: fee.semester, amount: Number(fee.amount), status: fee.status,
    reservedPaymentId: fee.reservedPaymentId,
  });
}));
for (const action of ['reserve', 'commit', 'release'] as const) {
  internalTuition.post('/:id/' + action, handle(async (req, res) => {
    const id = String(req.params.id);
    const { paymentId, amount } = req.body ?? {};
    if (!isUuid(id) || typeof paymentId !== 'string' || !isUuid(paymentId) ||
        !Number.isSafeInteger(amount) || amount <= 0) return sendError(res, 'Yêu cầu học phí không hợp lệ', 400);
    const outcome = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM tuition_fees WHERE id = ${id}::uuid FOR UPDATE`;
      const fee = await tx.tuitionFee.findUnique({ where: { id } });
      if (!fee) return 404;
      if (fee.status === 'PAID') return action === 'release' ? (fee.reservedPaymentId === paymentId ? 409 : 200) : (fee.reservedPaymentId === paymentId ? 200 : 409);
      if (action === 'release' && fee.reservedPaymentId !== paymentId) return 200;
      if (action === 'reserve' && fee.reservedPaymentId === paymentId) return 200;
      if (action === 'reserve' && (Number(fee.amount) !== amount || fee.reservedPaymentId)) return 409;
      if (action === 'commit' && fee.reservedPaymentId !== paymentId) return 409;
      await tx.tuitionFee.update({ where: { id }, data: {
        reservedPaymentId: action === 'release' ? null : paymentId,
        ...(action === 'commit' ? { status: 'PAID' } : {}),
      } });
      return 200;
    });
    return outcome === 200 ? sendSuccess(res, { paymentId }) : sendError(res, 'Học phí không thể xử lý', outcome);
  }));
}

