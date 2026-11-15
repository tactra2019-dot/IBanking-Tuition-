import { rateLimit } from '../../shared/rate-limit';
import { RequestHandler, Router } from 'express';
import { paymentController } from '../controllers/payment.controller';
import { userIdFromRequest } from '../../shared/auth';
import { prisma } from '../../shared/prisma';
import { isUuid, sendError } from '../../shared/response';

export const paymentRouter = Router();

function owned(kind: 'create' | 'account' | 'payment', controller: RequestHandler): RequestHandler {
  return (req, res, next) => {
    void (async () => {
      if (!userIdFromRequest(req)) return sendError(res, 'Token thiếu hoặc không hợp lệ', 401);
      const url = process.env.ACCOUNT_SERVICE_URL || 'http://127.0.0.1:4003/api';
      const response = await fetch(url + '/accounts/me', {
        headers: { Authorization: req.get('authorization')! }, signal: AbortSignal.timeout(3000), redirect: 'error',
      }).catch(() => new Response(null, { status: 503 }));
      if (!response.ok) return sendError(res, 'Không xác định được tài khoản', response.status);
      const { data: account } = await response.json();
      if (kind === 'create') {
        req.body = { ...req.body, accountId: account.accountId, payerEmail: account.email };
      } else if (kind === 'account') {
        if (req.params.accountId !== account.accountId) return sendError(res, 'Không tìm thấy tài khoản', 404);
      } else {
        const id = req.params.paymentId ?? req.body?.paymentId;
        if (typeof id !== 'string' || id !== id.trim() || !isUuid(id)) return sendError(res, 'paymentId không hợp lệ', 400);
        const payment = await prisma.payment.findFirst({ where: { id, accountId: account.accountId }, select: { id: true } });
        if (!payment) return sendError(res, 'Không tìm thấy giao dịch', 404);
      }
      controller(req, res, next);
    })().catch(next);
  };
}

paymentRouter.post('/payments/create-intent', rateLimit(12, 60000, req => userIdFromRequest(req) || req.ip || 'local'), owned('create', paymentController.createIntent));
paymentRouter.post('/payments/confirm-otp', owned('payment', paymentController.confirmOtp));
paymentRouter.get('/payments/account/:accountId', owned('account', paymentController.getByAccount));
paymentRouter.get('/payments/:paymentId', owned('payment', paymentController.getById));
