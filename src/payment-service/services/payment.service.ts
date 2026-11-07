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
      await mailerService.sendOtp(payment.payerEmail, otp.code, payment.transactionReference, tuitionAmount, studentCode);

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
      include: { student: true, tuitionFee: true },
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

    // 1. Atomic OTP check & consume
    const otpCheck = await otpService.verifyOtp(paymentId, otpCode);
    if (!otpCheck.valid) {
      const status = otpCheck.error === 'OTP_ALREADY_USED' ? 409 : 400;
      return { error: otpCheck.error, status, message: otpCheck.message };
    }

    // 2. Interactive Transaction: Account Advisory Lock + Payment Row Lock + Tuition Row Lock
    let deducted = false;
    const amount = Number(payment.amount);
    let completedPayment: any;

    try {
      completedPayment = await prisma.$transaction(
        async (tx) => {
          // 2a. Serialize concurrent payments from the SAME account (anti double-spending)
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${payment.accountId}))`;

          // 2b. Lock payment row to guarantee single processing
          const [lockedPayment]: any[] = await tx.$queryRaw`
            SELECT id, status FROM "payments" WHERE "id" = ${paymentId}::uuid FOR UPDATE
          `;
          if (!lockedPayment || lockedPayment.status !== 'PENDING') {
            throw new Error('PAYMENT_NOT_PENDING');
          }

          // 2c. Exclusive Row Lock on tuition_fee (anti duplicate MSSV payment)
          const [lockedTuition]: any[] = await tx.$queryRaw`
            SELECT id, status FROM "tuition_fees" WHERE "id" = ${payment.tuitionFeeId}::uuid FOR UPDATE
          `;
          if (!lockedTuition) throw new Error('TUITION_NOT_FOUND');
          if (lockedTuition.status === 'PAID') throw new Error('TUITION_ALREADY_PAID');

          // 2d. Deduct balance on Account Service
          const deductResult = await accountClient.deductBalance(payment.accountId, amount, payment.id);
          if (!deductResult.ok) {
            const err: any = new Error(deductResult.message || 'Trừ tiền tài khoản thất bại');
            err.code = 'DEDUCT_FAILED';
            err.status = deductResult.status || 402;
            throw err;
          }
          deducted = true;

          // Optional fault injection for integration test (simulates DB crash after debit)
          if (faultInjectionHook) faultInjectionHook();

          // 2e. Commit PAID & COMPLETED atomically
          await tx.tuitionFee.update({
            where: { id: payment.tuitionFeeId },
            data: { status: 'PAID' },
          });

          return tx.payment.update({
            where: { id: paymentId },
            data: { status: 'COMPLETED' },
          });
        },
        { timeout: 15000 }
      );
    } catch (err: any) {
      // Compensation refund if money was already debited before DB failure
      if (deducted) {
        await accountClient.refundBalance(payment.accountId, amount, payment.id);
      }

      if (err.message === 'TUITION_ALREADY_PAID') {
        await prisma.payment.updateMany({
          where: { id: paymentId, status: 'PENDING' },
          data: { status: 'FAILED', failureReason: 'Khoản học phí đã được người khác thanh toán' },
        });
        return {
          error: 'TUITION_ALREADY_PAID' as const,
          status: 409,
          message: 'Khoản học phí đã được thanh toán bởi giao dịch khác (Chống thanh toán trùng MSSV)',
        };
      }

      if (err.code === 'DEDUCT_FAILED') {
        await prisma.payment.updateMany({
          where: { id: paymentId, status: 'PENDING' },
          data: { status: 'FAILED', failureReason: err.message },
        });
        return {
          error: 'DEDUCT_FAILED' as const,
          status: err.status || 402,
          message: err.message,
        };
      }

      await prisma.payment.updateMany({
        where: { id: paymentId, status: 'PENDING' },
        data: { status: 'FAILED', failureReason: err.message || 'Lỗi xử lý giao dịch (đã hoàn tiền nếu có)' },
      });

      return {
        error: 'TRANSACTION_FAILED' as const,
        status: 500,
        message: err.message || 'Lỗi hoàn tất giao dịch',
      };
    }

    // 3. Receipt email sent AFTER commit — email hiccup must NEVER fail or refund a committed payment
    try {
      await mailerService.sendReceipt(
        payment.payerEmail,
        payment.transactionReference,
        amount,
        payment.student.studentCode,
        payment.student.fullName
      );
    } catch (mailErr) {
      console.warn('[mailer] Receipt send failed after commit:', mailErr);
    }

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
      include: { student: true, tuitionFee: true },
    });
    return p ? formatPayment(p) : null;
  },

  async getByAccount(accountId: string) {
    const list = await prisma.payment.findMany({
      where: { accountId: accountId.trim() },
      include: { student: true, tuitionFee: true },
      orderBy: { createdAt: 'desc' },
    });
    return list.map(formatPayment);
  },
};
