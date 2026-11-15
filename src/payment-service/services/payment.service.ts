import { Prisma } from '@ibanking/db';
import { studentRequest, TuitionSnapshot } from './student-client';
import { deliverReceipts, recoverPayment } from './recovery.service';
import crypto from 'node:crypto';
import { prisma } from '../../shared/prisma';
import { isEmail, isUuid } from '../../shared/response';
import { mailerService, NotificationDeliveryUnknown } from '../mailer/mailer.service';
import { accountClient } from './account-client.service';
import { otpService } from './otp.service';

export interface CreatePaymentIntentInput {
  accountId: string;
  studentCode: string;
  tuitionFeeId: string;
  payerEmail: string;
  amount?: number;
  idempotencyKey?: string;
}

function pendingStatus(payment: { status: string; createdAt: Date; otpCodes: { expiresAt: Date }[] }) {
  const expiresAt = payment.otpCodes[0]?.expiresAt.getTime() ?? payment.createdAt.getTime() + 300000;
  return payment.status === 'PENDING' && expiresAt <= Date.now() ? 'EXPIRED' : payment.status;
}

const formatPayment = (p: any) => ({
  id: p.id,
  accountId: p.accountId,
  studentCode: p.studentCode,
  studentName: p.studentName,
  semester: p.semester,
  amount: Number(p.amount),
  status: pendingStatus(p),
  transactionReference: p.transactionReference,
  payerEmail: p.payerEmail,
  failureReason: p.failureReason,
  expiresAt: p.otpCodes?.[0]?.expiresAt,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

// Test hook used ONLY by integration test to verify post-deduct DB crash rollback & compensation
export let faultInjectionHook: (() => void) | null = null;
export const setFaultInjectionHook = (fn: (() => void) | null) => {
  faultInjectionHook = fn;
};

export const paymentService = {
  async createIntent(input: CreatePaymentIntentInput) {
    if (!isUuid(input.tuitionFeeId)) {
      return { error: 'INVALID_TUITION_ID' as const, status: 400, message: 'tuitionFeeId không đúng định dạng UUID' };
    }
    if (!isEmail(input.payerEmail)) {
      return { error: 'INVALID_EMAIL' as const, status: 400, message: 'Địa chỉ email người nộp không hợp lệ' };
    }

    const studentCode = input.studentCode.trim().toUpperCase();

    const existingIntent = async () => input.idempotencyKey ? prisma.payment.findUnique({
      where: { accountId_idempotencyKey: { accountId: input.accountId, idempotencyKey: input.idempotencyKey } },
      include: { otpCodes: { orderBy: { createdAt: 'desc' }, take: 1 } },
    }) : null;
    const replay = (payment: NonNullable<Awaited<ReturnType<typeof existingIntent>>>) => {
      if (payment.tuitionFeeId !== input.tuitionFeeId || payment.studentCode !== studentCode ||
          (input.amount !== undefined && Number(payment.amount) !== input.amount)) {
        return { error: 'IDEMPOTENCY_CONFLICT', status: 409, message: 'Khóa đã dùng cho khoản phí khác' };
      }
      return { data: {
        paymentId: payment.id, transactionReference: payment.transactionReference, status: pendingStatus(payment),
        amount: Number(payment.amount), studentCode: payment.studentCode, studentName: payment.studentName,
        payerEmail: payment.payerEmail, expiresAt: payment.otpCodes[0]?.expiresAt,
        message: 'Yêu cầu đã được tiếp nhận',
      } };
    };
    const existing = await existingIntent();
    if (existing) return replay(existing);
    const response = await studentRequest(input.tuitionFeeId);
    const tuition: TuitionSnapshot | undefined = response.ok ? (await response.json()).data : undefined;
    if (!tuition || tuition.studentCode !== studentCode) {
      return { error: 'INVALID_TUITION', status: response.status >= 500 ? 503 : 404, message: 'Không xác minh được khoản học phí' };
    }
    if (tuition.status === 'PAID') {
      return { error: 'ALREADY_PAID' as const, status: 400, message: 'Khoản học phí này đã được thanh toán' };
    }

    const tuitionAmount = Number(tuition.amount);
    if (!Number.isSafeInteger(tuitionAmount) || tuitionAmount <= 0) return { error: 'INVALID_AMOUNT', status: 400, message: 'Số tiền học phí phải là VND nguyên dương' };

    if (input.amount !== undefined && Number(input.amount) !== tuitionAmount) {
      return {
        error: 'PARTIAL_NOT_ALLOWED' as const,
        status: 400,
        message: `Chỉ được phép thanh toán toàn bộ khoản học phí (${tuitionAmount.toLocaleString()} VNĐ)`,
      };
    }

    const accResult = await accountClient.getAccount(input.accountId);
    if (!accResult.ok || !accResult.data) {
      return {
        error: 'ACCOUNT_ERROR' as const,
        status: accResult.status || 404,
        message: accResult.message || 'Không tìm thấy tài khoản thanh toán',
      };
    }
    if (accResult.data.balance < tuitionAmount) {
      return {
        error: 'INSUFFICIENT_BALANCE' as const,
        status: 402,
        message: 'Số dư khả dụng không đủ để thực hiện giao dịch',
      };
    }

    const transactionReference = 'TXN-' + crypto.randomUUID();
    const paymentId = crypto.randomUUID();
    const otp = otpService.prepare(paymentId);
    const payment = await prisma.payment.create({
      data: {
        id: paymentId,
        otpCodes: { create: otp.record },
        accountId: input.accountId.trim(),
        studentId: tuition.studentId,
        studentCode,
        studentName: tuition.studentName,
        semester: tuition.semester,
        idempotencyKey: input.idempotencyKey,
        tuitionFeeId: tuition.id,
        amount: tuition.amount,
        status: 'PENDING',
        transactionReference,
        payerEmail: input.payerEmail.trim(),
      },
    }).catch(async error => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await existingIntent();
        if (winner) return { replay: replay(winner) };
      }
      throw error;
    });
    if ('replay' in payment) return payment.replay;

    try {
      await mailerService.sendOtp(payment.payerEmail, otp.code, payment.transactionReference, tuitionAmount, studentCode, payment.id, otp.record.expiresAt);

      return {
        data: {
          paymentId: payment.id,
          transactionReference: payment.transactionReference,
          status: payment.status,
          amount: tuitionAmount,
          studentCode,
          studentName: tuition.studentName,
          payerEmail: payment.payerEmail,
          expiresAt: otp.record.expiresAt,
          message: `Mã OTP đã được gửi tới ${payment.payerEmail}. Vui lòng xác nhận trong 5 phút.`,
        },
      };
    } catch (err: any) {
      if (err instanceof NotificationDeliveryUnknown) {
        return { data: { paymentId: payment.id, status: 'PENDING', message: 'Chưa xác nhận gửi OTP. Kiểm tra hộp thư hoặc tạo yêu cầu mới khi mã hết hạn.' } };
      }
      await prisma.payment.updateMany({
        where: { id: payment.id, status: 'PENDING' },
        data: { status: 'FAILED', failureReason: 'Không thể gửi email OTP' },
      });
      return { error: 'OTP_DELIVERY_FAILED' as const, status: 502, message: err.message || 'Không thể gửi mã OTP qua email' };
    }
  },

  async confirmOtp(paymentId: string, otpCode: string) {
    if (!isUuid(paymentId)) {
      return { error: 'INVALID_PAYMENT_ID' as const, status: 400, message: 'paymentId không đúng định dạng UUID' };
    }

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { otpCodes: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    if (!payment) {
      return { error: 'PAYMENT_NOT_FOUND' as const, status: 404, message: 'Không tìm thấy giao dịch' };
    }

    if (payment.status === 'COMPLETED') {
      return { error: 'PAYMENT_ALREADY_COMPLETED' as const, status: 409, message: 'Giao dịch đã được hoàn tất trước đó' };
    }

    if (['PROCESSING', 'REFUND_PENDING', 'REVIEW_REQUIRED'].includes(payment.status)) {
      return { error: 'PAYMENT_PROCESSING', status: 202, message: 'Đang đối soát giao dịch' };
    }
    if (payment.status !== 'PENDING') {
      return {
        error: 'PAYMENT_NOT_PENDING' as const,
        status: 400,
        message: `Giao dịch không ở trạng thái chờ xác nhận (trạng thái hiện tại: ${payment.status})`,
      };
    }

    const otpCheck = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
      const current = await tx.payment.findUniqueOrThrow({
        where: { id: paymentId }, include: { otpCodes: { orderBy: { createdAt: 'desc' }, take: 1 } },
      });
      if (current.status !== 'PENDING') {
        return { valid: false as const, error: 'PAYMENT_NOT_PENDING', message: 'Giao dịch không ở trạng thái chờ xác nhận' };
      }
      if (!current.otpCodes.length && pendingStatus(current) === 'EXPIRED') {
        await tx.payment.update({ where: { id: paymentId }, data: { status: 'EXPIRED', failureReason: 'Không có mã OTP' } });
        return { valid: false as const, error: 'OTP_EXPIRED', message: 'Hãy tạo yêu cầu thanh toán mới' };
      }
      const result = await otpService.verifyOtp(paymentId, otpCode, tx);
      if (result.valid) {
        await tx.payment.update({ where: { id: paymentId }, data: { status: 'PROCESSING' } });
      }
      return result;
    });
    if (!otpCheck.valid) {
      return { error: otpCheck.error, status: 400, message: otpCheck.message };
    }
    const amount = Number(payment.amount);
    let completedPayment;
    try {
      completedPayment = await recoverPayment(paymentId, faultInjectionHook ?? undefined);
      if (completedPayment.status === 'REFUND_PENDING') completedPayment = await recoverPayment(paymentId);
    } catch {
      return { error: 'PAYMENT_PROCESSING', status: 202, message: 'Đang đối soát giao dịch, vui lòng tra cứu lại' };
    }
    if (completedPayment.status !== 'COMPLETED') {
      return {
        error: completedPayment.status === 'FAILED' ? 'TRANSACTION_FAILED' : 'PAYMENT_PROCESSING',
        status: completedPayment.status === 'FAILED' ? 409 : 202,
        message: completedPayment.failureReason || 'Đang đối soát giao dịch',
      };
    }
    void deliverReceipts(paymentId).catch(() => undefined);

    return {
      data: {
        paymentId: completedPayment.id,
        transactionReference: completedPayment.transactionReference,
        status: completedPayment.status,
        amount,
        studentCode: payment.studentCode,
        studentName: payment.studentName,
        paidAt: completedPayment.updatedAt,
        message: 'Thanh toán học phí thành công',
      },
    };
  },

  async getById(paymentId: string) {
    if (!isUuid(paymentId)) return null;
    const p = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { otpCodes: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    return p ? formatPayment(p) : null;
  },

  async getByAccount(accountId: string) {
    const list = await prisma.payment.findMany({
      where: { accountId: accountId.trim() },
      include: { otpCodes: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    });
    return list.map(formatPayment);
  },
};
