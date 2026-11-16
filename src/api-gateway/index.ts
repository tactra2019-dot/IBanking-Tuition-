import { rateLimit } from '../shared/rate-limit';
import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { secret, userIdFromRequest } from '../shared/auth';
import { handle, handleError } from '../shared/core-http';
import { sendError } from '../shared/response';
import { createSwaggerRouter } from '../shared/swagger';

export const app = express();
app.enable('strict routing');
app.enable('case sensitive routing');
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '8kb' }));
app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const endpoints = {
  auth: () => process.env.AUTH_SERVICE_ORIGIN || 'http://127.0.0.1:4004',
  account: () => process.env.ACCOUNT_SERVICE_ORIGIN || 'http://127.0.0.1:4003',
  student: () => process.env.STUDENT_SERVICE_ORIGIN || 'http://127.0.0.1:4001',
  payment: () => process.env.PAYMENT_SERVICE_ORIGIN || 'http://127.0.0.1:4002',
};

function forward(service: keyof typeof endpoints, requiresLogin = true) {
  return handle(async (req, res) => {
    if (requiresLogin && !userIdFromRequest(req)) return sendError(res, 'Token thiếu hoặc không hợp lệ', 401);
    const headers = new Headers({ 'Content-Type': 'application/json' });
    const authorization = req.get('authorization');
    const idempotencyKey = req.get('idempotency-key');
    if (authorization) headers.set('Authorization', authorization);
    if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
    try {
      const upstream = await fetch(endpoints[service]() + req.originalUrl, {
        method: req.method, headers, redirect: 'error', signal: AbortSignal.timeout(14000),
        body: req.method === 'POST' ? JSON.stringify(req.body ?? {}) : undefined,
      });
      return res.status(upstream.status).type(upstream.headers.get('content-type') || 'application/json')
        .send(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      return sendError(res, 'Dịch vụ chưa phản hồi. Hãy kiểm tra trạng thái trước khi thử lại.', 503);
    }
  });
}

app.use(createSwaggerRouter());
app.get('/health', (_req, res) => res.json({ service: 'api-gateway', status: 'ok' }));
app.post('/api/auth/login', rateLimit(60, 60000, req => req.ip || 'local'), forward('auth', false));
app.get('/api/auth/me', forward('auth'));
app.post(['/api/auth/email-change/request', '/api/auth/email-change/confirm'], forward('auth'));
app.get(['/api/accounts/me', '/api/accounts/me/balance', '/api/accounts/me/transactions'], forward('account'));
app.get(['/api/students/:studentCode', '/api/tuitions/student/:studentCode'], forward('student'));
app.post(['/api/payments/create-intent', '/api/payments/confirm-otp'], forward('payment'));
app.get(['/api/payments/account/:accountId', '/api/payments/:paymentId'], forward('payment'));
app.use((_req, res) => sendError(res, 'Không tìm thấy endpoint', 404));
app.use(handleError);

if (require.main === module) {
  secret('JWT_SECRET');
  app.listen(Number(process.env.PORT_GATEWAY) || 4000, process.env.GATEWAY_HOST || '127.0.0.1');
}
