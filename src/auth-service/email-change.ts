import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { rateLimit } from '../shared/rate-limit';
import { secret, userIdFromRequest, verifyPassword } from '../shared/auth';
import { handle } from '../shared/core-http';
import { prisma } from '../shared/prisma';
import { isEmail, sendError, sendSuccess } from '../shared/response';

export const emailChangeRouter = Router();
const lifetimeMs = 5 * 60_000;
const cooldownMs = 60_000;

function codeHash(userId: string, email: string, code: string) {
  return createHmac('sha256', secret('JWT_SECRET'))
    .update(`email-change:${userId}:${email}:${code}`)
    .digest('hex');
}

emailChangeRouter.post('/request', rateLimit(5, 60_000, req => userIdFromRequest(req) || req.ip || 'unknown'), handle(async (req, res) => {
  const userId = userIdFromRequest(req);
  if (!userId) return sendError(res, 'Token thiếu hoặc không hợp lệ', 401);
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || email !== email.trim() || email.length > 100 || !isEmail(email) ||
      typeof password !== 'string' || !password || Buffer.byteLength(password) > 1024) {
    return sendError(res, 'Email hoặc mật khẩu không hợp lệ', 400);
  }
  const normalizedEmail = email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, passwordHash: true } });
  if (!user) return sendError(res, 'Người dùng không còn tồn tại', 401);
  if (!await verifyPassword(password, user.passwordHash)) return sendError(res, 'Mật khẩu không đúng', 401);
  if (user.email.toLowerCase() === normalizedEmail) return sendError(res, 'Email mới trùng với email hiện tại', 409);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + lifetimeMs);
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const hash = codeHash(userId, normalizedEmail, code);
  const updated = await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [{ emailChangeRequestedAt: null }, { emailChangeRequestedAt: { lt: new Date(now.getTime() - cooldownMs) } }],
    },
    data: {
      pendingEmail: normalizedEmail,
      emailChangeCodeHash: hash,
      emailChangeExpiresAt: expiresAt,
      emailChangeRequestedAt: now,
      emailChangeAttempts: 0,
    },
  });
  if (updated.count !== 1) return sendError(res, 'Vui lòng chờ 60 giây trước khi yêu cầu mã mới', 429);

  try {
    const endpoint = process.env.NOTIFICATION_SERVICE_URL;
    const key = process.env.NOTIFICATION_INTERNAL_KEY;
    if (!endpoint || !key) throw new Error('Notification chưa được cấu hình');
    const response = await fetch(`${endpoint}/email-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Key': key },
      body: JSON.stringify({ eventId: `email-${randomUUID()}`, to: normalizedEmail, otp: code, expiresAt }),
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error(`Notification trả ${response.status}`);
  } catch {
    // SMTP có thể đã nhận thư trước khi kết nối hết hạn. Giữ mã để người dùng vẫn xác minh được.
    return sendError(res, 'Chưa xác nhận được việc gửi email. Hãy kiểm tra hộp thư trước khi yêu cầu mã mới.', 503);
  }
  return sendSuccess(res, { email: normalizedEmail, expiresAt }, 'Mã xác minh đã được gửi đến email mới', 202);
}));

emailChangeRouter.post('/confirm', rateLimit(12, 60_000, req => userIdFromRequest(req) || req.ip || 'unknown'), handle(async (req, res) => {
  const userId = userIdFromRequest(req);
  if (!userId) return sendError(res, 'Token thiếu hoặc không hợp lệ', 401);
  const code = req.body?.code;
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return sendError(res, 'Mã xác minh phải có 6 chữ số', 400);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pendingEmail: true, emailChangeCodeHash: true, emailChangeExpiresAt: true, emailChangeAttempts: true },
  });
  if (!user?.pendingEmail || !user.emailChangeCodeHash || !user.emailChangeExpiresAt) {
    return sendError(res, 'Không có yêu cầu đổi email đang chờ', 404);
  }
  const now = new Date();
  if (user.emailChangeExpiresAt <= now) return sendError(res, 'Mã xác minh đã hết hạn', 410);
  if (user.emailChangeAttempts >= 5) return sendError(res, 'Đã vượt quá số lần nhập mã', 429);
  const where = {
    id: userId,
    pendingEmail: user.pendingEmail,
    emailChangeCodeHash: user.emailChangeCodeHash,
    emailChangeExpiresAt: { gt: now },
    emailChangeAttempts: { lt: 5 },
  };
  if (codeHash(userId, user.pendingEmail, code) !== user.emailChangeCodeHash) {
    await prisma.user.updateMany({ where, data: { emailChangeAttempts: { increment: 1 } } });
    return sendError(res, 'Mã xác minh không đúng', 400);
  }
  const updated = await prisma.user.updateMany({
    where,
    data: {
      email: user.pendingEmail,
      pendingEmail: null,
      emailChangeCodeHash: null,
      emailChangeExpiresAt: null,
      emailChangeRequestedAt: null,
      emailChangeAttempts: 0,
    },
  });
  if (updated.count !== 1) return sendError(res, 'Yêu cầu đã thay đổi. Vui lòng thử lại.', 409);
  return sendSuccess(res, { email: user.pendingEmail }, 'Email nhận thông báo đã được cập nhật');
}));
