import { startRecoveryWorker } from '../payment-service/services/recovery.service';
import 'dotenv/config';
import cors from 'cors';
import express, { RequestHandler } from 'express';
import { app as authApp } from '../auth-service';
import { app as accountApp } from '../account-service';
import { accountForUser } from '../account-service/accounts';
import { app as studentApp } from '../student-service';
import { app as paymentApp } from '../payment-service';
import { secret, userIdFromRequest } from '../shared/auth';
import { handleError } from '../shared/core-http';
import { prisma } from '../shared/prisma';
import { isUuid, sendError } from '../shared/response';

export const app = express();
app.enable('strict routing');
app.enable('case sensitive routing');
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '8kb' }));
app.use((req, res, next) => {
  for (const header of Object.keys(req.headers)) {
    if (header.startsWith('x-') || header === 'forwarded') delete req.headers[header];
  }
  res.set('Cache-Control', 'no-store');
  next();
});

const authenticated: RequestHandler = (req, res, next) => {
  const userId = userIdFromRequest(req);
  if (!userId) return sendError(res, 'Token thiếu hoặc không hợp lệ', 401);
  res.locals.userId = userId;
  next();
};

const ownPayment: RequestHandler = (req, res, next) => {
  void (async () => {
    const account = await accountForUser(res.locals.userId);
    if (!account) return sendError(res, 'Không tìm thấy tài khoản', 404);
    if (req.path.toLowerCase() === '/api/payments/create-intent') {
      req.body = { ...req.body, accountId: account.id, payerEmail: account.user.email };
    } else if (req.params.accountId !== undefined) {
      if (req.params.accountId !== account.id) return sendError(res, 'Không tìm thấy tài khoản', 404);
    } else {
      const paymentId = req.params.paymentId ?? req.body?.paymentId;
      if (typeof paymentId !== 'string' || paymentId !== paymentId.trim() || !isUuid(paymentId)) {
        return sendError(res, 'paymentId không hợp lệ', 400);
      }
      const payment = await prisma.payment.findFirst({
        where: { id: paymentId, accountId: account.id },
        select: { id: true },
      });
      if (!payment) return sendError(res, 'Không tìm thấy giao dịch', 404);
    }
    next();
  })().catch(next);
};

app.get('/health', (_req, res) => res.json({ service: 'api-gateway', status: 'ok' }));
app.post('/api/auth/login', authApp);
app.get('/api/auth/me', authenticated, authApp);
app.get(['/api/accounts/me', '/api/accounts/me/balance', '/api/accounts/me/transactions'], authenticated, accountApp);
app.get(['/api/students/:studentCode', '/api/tuitions/student/:studentCode'], authenticated, studentApp);
app.post('/api/payments/create-intent', authenticated, ownPayment, paymentApp);
app.post('/api/payments/confirm-otp', authenticated, ownPayment, paymentApp);
app.get('/api/payments/account/:accountId', authenticated, ownPayment, paymentApp);
app.get('/api/payments/:paymentId', authenticated, ownPayment, paymentApp);
app.use((_req, res) => sendError(res, 'Không tìm thấy endpoint', 404));
app.use(handleError);

if (require.main === module) {
  startRecoveryWorker();
  const jwt = secret('JWT_SECRET');
  if (jwt === secret('ACCOUNT_SERVICE_TOKEN')) throw new Error('Hai khóa phải khác nhau');
  accountApp.listen(Number(process.env.PORT_ACCOUNT) || 4003, '127.0.0.1');
  const port = Number(process.env.PORT_GATEWAY) || 4000;
  app.listen(port, process.env.GATEWAY_HOST || '127.0.0.1', () => {
    console.log(`[api-gateway] Cổng ${port}`);
  });
}



