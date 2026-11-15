import { Request, Response } from 'express';
import { sendError, sendSuccess } from '../../shared/response';
import { paymentService } from '../services/payment.service';

export const paymentController = {
  async createIntent(req: Request, res: Response) {
    try {
      const { accountId, studentCode, tuitionFeeId, payerEmail, amount } = req.body || {};
      if (!accountId || typeof studentCode !== 'string' || !studentCode.trim() || studentCode.length > 20 || typeof tuitionFeeId !== 'string' || !payerEmail || (amount !== undefined && (!Number.isSafeInteger(amount) || amount <= 0))) {
        return sendError(res, 'Thiếu thông tin bắt buộc (accountId, studentCode, tuitionFeeId, payerEmail)', 400);
      }

      const idempotencyKey = req.get('Idempotency-Key');
      if (idempotencyKey !== undefined && !/^[A-Za-z0-9_-]{1,80}$/.test(idempotencyKey)) {
        return sendError(res, 'Idempotency-Key không hợp lệ', 400);
      }
      const result = await paymentService.createIntent({
        idempotencyKey,
        accountId: String(accountId),
        studentCode: String(studentCode),
        tuitionFeeId: String(tuitionFeeId),
        payerEmail: String(payerEmail),
        amount: amount !== undefined ? Number(amount) : undefined,
      });

      if ('error' in result) {
        return sendError(res, result.message || 'Lỗi tạo giao dịch', result.status, { code: result.error });
      }
      return sendSuccess(res, result.data, result.data.message, 201);
    } catch {
      return sendError(res, 'Lỗi khởi tạo giao dịch thanh toán', 500);
    }
  },

  async confirmOtp(req: Request, res: Response) {
    try {
      const { paymentId, otpCode } = req.body || {};
      if (typeof paymentId !== 'string' || typeof otpCode !== 'string' || !/^[0-9]{6}$/.test(otpCode)) {
        return sendError(res, 'Thiếu paymentId hoặc otpCode', 400);
      }

      const result = await paymentService.confirmOtp(String(paymentId), String(otpCode));
      if ('error' in result) {
        return sendError(res, result.message || 'Lỗi xác thực OTP', result.status, { code: result.error });
      }
      return sendSuccess(res, result.data, result.data.message, 200);
    } catch {
      return sendError(res, 'Lỗi xác thực OTP và thanh toán', 500);
    }
  },

  async getById(req: Request, res: Response) {
    try {
      const payment = await paymentService.getById(String(req.params.paymentId));
      if (!payment) return sendError(res, 'Không tìm thấy giao dịch', 404);
      return sendSuccess(res, payment);
    } catch {
      return sendError(res, 'Lỗi tra cứu giao dịch', 500);
    }
  },

  async getByAccount(req: Request, res: Response) {
    try {
      const payments = await paymentService.getByAccount(String(req.params.accountId));
      return sendSuccess(res, payments);
    } catch {
      return sendError(res, 'Lỗi tra cứu lịch sử giao dịch', 500);
    }
  },
};
