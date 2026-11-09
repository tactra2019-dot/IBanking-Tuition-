import { deliverReceipts, recoverPayment } from './recovery.service';
import crypto from 'node:crypto';
import { prisma } from '../../shared/prisma';
import { isEmail, isUuid } from '../../shared/response';
import { mailerService } from '../mailer/mailer.service';
import { accountClient } from './account-client.service';
import { otpService } from './otp.service';

export interface CreatePaymentIntentInput {
  accountId: string;
  studentCode: string;
  tuitionFeeId: string;
  payerEmail: string;
  amount?: number;
}

const formatPayment = (p: any) => ({
  id: p.id,
  accountId: p.accountId,
  studentCode: p.student.studentCode,
  studentName: p.student.fullName,
  semester: p.tuitionFee.semester,
  amount: Number(p.amount),
  status: p.status,
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

    const tuition = await prisma.tuitionFee.findUnique({
      where: { id: input.tuitionFeeId },
      include: { student: true },
    });

    if (!tuition || tuition.student.studentCode !== studentCode) {
      return { error: 'INVALID_TUITION' as const, status: 404, message: 'Khoản học phí không tồn tại hoặc không khớp MSSV' };
    }

    if (tuition.status === 'PAID') {
      return { error: 'ALREADY_PAID' as const, status: 400, message: 'Khoản học phí này đã được thanh toán' };
    }

    const tuitionAmount = Number(tuition.amount);

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

    const transactionReference = `TXN-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
    const payment = await prisma.payment.create({
      data: {
        accountId: input.accountId.trim(),
        studentId: tuition.studentId,
        tuitionFeeId: tuition.id,
        amount: tuition.amount,
        status: 'PENDING',
        transactionReference,
        payerEmail: input.payerEmail.trim(),
      },
    });

    try {
      const otp = await otpService.generateUniqueOtp(payment.id);
      await mailerService.sendOtp(payment.payerEmail, otp.code, payment.transactionReference, tuitionAmount, studentCode, payment.id, otp.expiresAt);

      return {
        data: {
          paymentId: payment.id,
          transactionReference: payment.transactionReference,
          status: payment.status,
          amount: tuitionAmount,
          studentCode,
          studentName: tuition.student.fullName,
          payerEmail: payment.payerEmail,
          expiresAt: otp.expiresAt,
          message: `Mã OTP đã được gửi tới ${payment.payerEmail}. Vui lòng xác nhận trong 5 phút.`,
        },
      };
    } catch (err: any) {
      await prisma.payment.update({
        where: { id: payment.id },
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
      include: { student: true, tuitionFee: true, otpCodes: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    if (!payment) {
      return { error: 'PAYMENT_NOT_FOUND' as const, status: 404, message: 'Không tìm thấy giao dịch' };
    }

    if (payment.status === 'COMPLETED') {
      return { error: 'PAYMENT_ALREADY_COMPLETED' as const, status: 409, message: 'Giao dịch đã được hoàn tất trước đó' };
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
    await deliverReceipts().catch(() => undefined);

    return {
      data: {
        paymentId: completedPayment.id,
        transactionReference: completedPayment.transactionReference,
        status: completedPayment.status,
        amount,
        studentCode: payment.student.studentCode,
        studentName: payment.student.fullName,
        paidAt: completedPayment.updatedAt,
        message: 'Thanh toán học phí thành công',
      },
    };
  },

  async getById(paymentId: string) {
    if (!isUuid(paymentId)) return null;
    const p = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { student: true, tuitionFee: true, otpCodes: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    return p ? formatPayment(p) : null;
  },

  async getByAccount(accountId: string) {
    const list = await prisma.payment.findMany({
      where: { accountId: accountId.trim() },
      include: { student: true, tuitionFee: true, otpCodes: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    });
    return list.map(formatPayment);
  },
};


