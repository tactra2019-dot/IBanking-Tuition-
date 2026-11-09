import 'dotenv/config';
import express from 'express';
import { issueToken, secret, userIdFromRequest, verifyPassword } from '../shared/auth';
import { coreDocs, handle, handleError } from '../shared/core-http';
import { prisma } from '../shared/prisma';
import { sendError, sendSuccess } from '../shared/response';

export const app = express();
app.use(express.json({ limit: '8kb' }));
app.use(coreDocs('auth'));
app.get('/health', (_req, res) => res.json({ service: 'auth-service', status: 'ok' }));

app.post('/api/auth/login', handle(async (req, res) => {
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

app.get('/api/auth/me', handle(async (req, res) => {
  const userId = userIdFromRequest(req);
  if (!userId) return sendError(res, 'Token thiếu hoặc không hợp lệ', 401);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true, fullName: true, email: true, phone: true, account: { select: { id: true } } },
  });
  if (!user) return sendError(res, 'Người dùng không còn tồn tại', 401);
  const { account, ...profile } = user;
  return sendSuccess(res, { userId, ...profile, accountId: account?.id ?? null });
}));
app.use(handleError);

if (require.main === module) {
  secret('JWT_SECRET');
  app.listen(Number(process.env.PORT_AUTH) || 4004, '127.0.0.1');
}

