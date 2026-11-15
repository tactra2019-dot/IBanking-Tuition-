import 'dotenv/config';
import express from 'express';
import { isPaymentService, secret, userIdFromRequest } from '../shared/auth';
import { coreDocs, handle, handleError } from '../shared/core-http';

import { isUuid, sendError, sendSuccess } from '../shared/response';
import { accountById, accountForUser, AccountInfo, serializeAccount } from './accounts';
import { changeBalance, DebitError } from './debit';

export const app = express();
app.use(express.json({ limit: '8kb' }));
app.use(coreDocs('account'));
app.get('/health', (_req, res) => res.json({ service: 'account-service', status: 'ok' }));


function withAccount(fn: (account: AccountInfo, res: express.Response, req: express.Request) => Promise<unknown>) {
  return handle(async (req, res) => {
    const userId = userIdFromRequest(req);
    if (!userId) return sendError(res, 'Token thiếu hoặc không hợp lệ', 401);
    const account = await accountForUser(userId);
    if (!account) return sendError(res, 'Không tìm thấy tài khoản', 404);
    return fn(account, res, req);
  });
}

app.get('/api/accounts/me', withAccount(async (account, res) =>
  sendSuccess(res, await serializeAccount(account))));
app.get('/api/accounts/me/balance', withAccount(async ({ id: accountId, balance }, res) =>
  sendSuccess(res, { accountId, balance: Number(balance) })));
app.get('/api/accounts/me/transactions', withAccount(async ({ id }, res, req) => {
  const payment = process.env.PAYMENT_SERVICE_ORIGIN || 'http://127.0.0.1:4002';
  const response = await fetch(payment + '/api/payments/account/' + encodeURIComponent(id), {
    headers: { Authorization: req.get('authorization')! }, signal: AbortSignal.timeout(6500), redirect: 'error',
  });
  if (!response.ok) return sendError(res, 'Không lấy được lịch sử thanh toán', response.status);
  const { data } = await response.json();
  return sendSuccess(res, data.slice(0, 100));
}));
app.get('/api/accounts/:accountId', handle(async (req, res) => {
  if (!isPaymentService(req)) return sendError(res, 'Thiếu xác thực dịch vụ', 401);
  const account = await accountById(String(req.params.accountId));
  if (!account) return sendError(res, 'Không tìm thấy tài khoản', 404);
  return sendSuccess(res, await serializeAccount(account));
}));

for (const [route, operation] of [['deduct', 'debit'], ['refund', 'refund']] as const) {
  app.post(`/api/accounts/${route}`, handle(async (req, res) => {
    if (!isPaymentService(req)) {
      return sendError(res, 'Thiếu xác thực dịch vụ', 401, { code: 'SERVICE_UNAUTHORIZED' });
    }
    const { accountId, amount, paymentId } = req.body ?? {};
    if (typeof accountId !== 'string' || !/^[\w-]{1,50}$/.test(accountId) ||
        typeof paymentId !== 'string' || paymentId !== paymentId.trim() || !isUuid(paymentId) ||
        !Number.isSafeInteger(amount) || amount <= 0 || amount > 999999999999) {
      return sendError(res, 'accountId, paymentId hoặc amount không hợp lệ', 400, { code: 'INVALID_INPUT' });
    }
    try {
      const balance = await changeBalance({ accountId, amount, paymentId }, operation);
      if (balance === null) {
        return sendError(res, 'Số dư khả dụng không đủ', 402, { code: 'INSUFFICIENT_BALANCE' });
      }
      const data = operation === 'debit'
        ? { paymentId, accountId, remainingBalance: Number(balance) }
        : { paymentId, accountId, balance: Number(balance) };
      return sendSuccess(res, data);
    } catch (error) {
      if (!(error instanceof DebitError)) throw error;
      return sendError(res, error.message, error.status, { code: error.code });
    }
  }));
}
app.use(handleError);

if (require.main === module) {
  secret('JWT_SECRET');
  secret('ACCOUNT_SERVICE_TOKEN');
  app.listen(Number(process.env.PORT_ACCOUNT) || 4003, process.env.SERVICE_HOST || '127.0.0.1');
}
