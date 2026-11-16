import { rateLimit } from '../shared/rate-limit';
import 'dotenv/config';
import express from 'express';
import { internalAllowed } from '../shared/internal';
import { issueToken, secret, userIdFromRequest, verifyPassword } from '../shared/auth';
import { coreDocs, handle, handleError } from '../shared/core-http';
import { prisma } from '../shared/prisma';
import { sendError, sendSuccess } from '../shared/response';
import { emailChangeRouter } from './email-change';

export const app = express();
app.use(express.json({ limit: '8kb' }));
app.use(coreDocs('auth'));
app.get('/health', (_req, res) => res.json({ service: 'auth-service', status: 'ok' }));

app.post('/api/auth/login', rateLimit(12, 60000, req => String(req.body?.username || '').slice(0, 80).trim()), handle(async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || username.length > 80 || !username.trim() ||
      typeof password !== 'string' || !password || Buffer.byteLength(password) > 1024) {
    return sendError(res, 'Username hoặc mật khẩu không hợp lệ', 400);
  }
  const user = await prisma.user.findUnique({
    where: { username: username.trim() },
    select: { id: true, passwordHash: true },
  });
  if (!await verifyPassword(password, user?.passwordHash) || !user) {
    return sendError(res, 'Sai username hoặc mật khẩu', 401);
  }
  res.set('Cache-Control', 'no-store');
  return sendSuccess(res, issueToken(user.id));
}));

app.get('/internal/users/:id', handle(async (req, res) => {
  if (!internalAllowed(req, 'AUTH_SERVICE_TOKEN')) return sendError(res, 'Thiếu xác thực dịch vụ', 401);
  const profile = await prisma.user.findUnique({
    where: { id: String(req.params.id) }, select: { fullName: true, email: true, phone: true },
  });
  return profile ? sendSuccess(res, profile) : sendError(res, 'Không tìm thấy người dùng', 404);
}));

app.get('/api/auth/me', handle(async (req, res) => {
  const userId = userIdFromRequest(req);
  if (!userId) return sendError(res, 'Token thiếu hoặc không hợp lệ', 401);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, fullName: true, email: true, phone: true },
  });
  if (!user) return sendError(res, 'Người dùng không còn tồn tại', 401);
  const accountUrl = process.env.ACCOUNT_SERVICE_URL || 'http://127.0.0.1:4003/api';
  const response = await fetch(accountUrl + '/accounts/me/balance', {
    headers: { Authorization: req.get('authorization')! }, signal: AbortSignal.timeout(2500), redirect: 'error',
  });
  if (!response.ok && response.status !== 404) return sendError(res, 'Không lấy được tài khoản', 503);
  const accountId = response.ok ? (await response.json()).data.accountId : null;
  return sendSuccess(res, { userId, ...user, accountId });
}));
app.use('/api/auth/email-change', emailChangeRouter);
app.use(handleError);

if (require.main === module) {
  secret('JWT_SECRET');
  app.listen(Number(process.env.PORT_AUTH) || 4004, process.env.SERVICE_HOST || '127.0.0.1');
}
