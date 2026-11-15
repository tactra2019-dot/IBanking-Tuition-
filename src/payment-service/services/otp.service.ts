import { Prisma } from '@ibanking/db';
import crypto from 'node:crypto';
import { prisma } from '../../shared/prisma';

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_OTP_ATTEMPTS = 5;

function otpDigest(paymentId: string, code: string) {
  return crypto.createHmac('sha256', otpSecret()).update(paymentId + ':' + code).digest('hex');
}

export function otpSecret() {
  const secret = process.env.OTP_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('Thiếu OTP_SECRET (tối thiểu 32 byte)');
  return secret;
}

export const otpService = {
  prepare(paymentId: string) {
    const code = String(crypto.randomInt(100000, 1000000));
    return { code, record: { code: otpDigest(paymentId, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) } };
  },

  async verifyOtp(paymentId: string, inputCode: string, db: Prisma.TransactionClient = prisma) {
    const otp = await db.otpCode.findFirst({
      where: { paymentId },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) return { valid: false as const, error: 'OTP_NOT_FOUND', message: 'Không tìm thấy mã OTP cho giao dịch này' };
    if (otp.isUsed) return { valid: false as const, error: 'OTP_ALREADY_USED', message: 'Mã OTP đã được sử dụng' };

    if (new Date() > otp.expiresAt) {
      await db.otpCode.updateMany({ where: { id: otp.id, isUsed: false }, data: { isUsed: true } });
      await db.payment.updateMany({
        where: { id: paymentId, status: 'PENDING' },
        data: { status: 'EXPIRED', failureReason: 'OTP hết hạn (quá 5 phút)' },
      });
      return { valid: false as const, error: 'OTP_EXPIRED', message: 'Mã OTP đã hết hạn (quá 5 phút)' };
    }

    const supplied = Buffer.from(otpDigest(paymentId, inputCode.trim()), 'hex');
    const expected = Buffer.from(otp.code, 'hex');
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
      const nextAttempts = otp.attempts + 1;
      const exhausted = nextAttempts >= MAX_OTP_ATTEMPTS;

      await db.otpCode.update({
        where: { id: otp.id },
        data: { attempts: nextAttempts, isUsed: exhausted },
      });

      if (exhausted) {
        await db.payment.updateMany({
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
    const consumed = await db.otpCode.updateMany({
      where: { id: otp.id, isUsed: false },
      data: { isUsed: true },
    });
    if (consumed.count === 0) {
      return { valid: false as const, error: 'OTP_ALREADY_USED', message: 'Mã OTP đã được sử dụng bởi yêu cầu đồng thời' };
    }

    return { valid: true as const, otp };
  },
};
