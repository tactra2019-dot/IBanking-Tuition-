import crypto from 'node:crypto';
import { prisma } from '../../shared/prisma';

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_OTP_ATTEMPTS = 5;

export const otpService = {
  async generateUniqueOtp(paymentId: string) {
    await prisma.otpCode.updateMany({
      where: { paymentId, isUsed: false },
      data: { isUsed: true },
    });

    for (let i = 0; i < 20; i++) {
      const code = String(crypto.randomInt(100000, 1000000));
      const activeCollision = await prisma.otpCode.findFirst({
        where: { code, isUsed: false, expiresAt: { gt: new Date() } },
      });
      if (!activeCollision) {
        return prisma.otpCode.create({
          data: { paymentId, code, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
        });
      }
    }

    throw new Error('Không thể sinh mã OTP duy nhất');
  },

  async verifyOtp(paymentId: string, inputCode: string) {
    const otp = await prisma.otpCode.findFirst({
      where: { paymentId },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) return { valid: false as const, error: 'OTP_NOT_FOUND', message: 'Không tìm thấy mã OTP cho giao dịch này' };
    if (otp.isUsed) return { valid: false as const, error: 'OTP_ALREADY_USED', message: 'Mã OTP đã được sử dụng' };

    if (new Date() > otp.expiresAt) {
      await prisma.otpCode.updateMany({ where: { id: otp.id, isUsed: false }, data: { isUsed: true } });
      await prisma.payment.updateMany({
        where: { id: paymentId, status: 'PENDING' },
        data: { status: 'EXPIRED', failureReason: 'OTP hết hạn (quá 5 phút)' },
      });
      return { valid: false as const, error: 'OTP_EXPIRED', message: 'Mã OTP đã hết hạn (quá 5 phút)' };
    }

    if (otp.code !== inputCode.trim()) {
      const nextAttempts = otp.attempts + 1;
      const exhausted = nextAttempts >= MAX_OTP_ATTEMPTS;

      await prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: nextAttempts, isUsed: exhausted },
      });

      if (exhausted) {
        await prisma.payment.updateMany({
          where: { id: paymentId, status: 'PENDING' },
          data: { status: 'FAILED', failureReason: 'Nhập sai OTP quá 5 lần' },
        });
        return { valid: false as const, error: 'OTP_MAX_ATTEMPTS', message: 'Nhập sai OTP quá 5 lần, giao dịch đã bị hủy' };
      }

      return {
        valid: false as const,
        error: 'OTP_INVALID',
        message: `Mã OTP không chính xác (còn ${MAX_OTP_ATTEMPTS - nextAttempts} lần thử)`,
      };
    }

    // Atomic compare-and-set: prevents 2 concurrent confirmOtp calls from consuming the same OTP twice
    const consumed = await prisma.otpCode.updateMany({
      where: { id: otp.id, isUsed: false },
      data: { isUsed: true },
    });
    if (consumed.count === 0) {
      return { valid: false as const, error: 'OTP_ALREADY_USED', message: 'Mã OTP đã được sử dụng bởi yêu cầu đồng thời' };
    }

    return { valid: true as const, otp };
  },
};
