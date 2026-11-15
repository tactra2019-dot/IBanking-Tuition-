import { app as authApp } from '../src/auth-service';
import { app as studentApp } from '../src/student-service';
import { app as paymentApp } from '../src/payment-service';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { after, before, test } from 'node:test';
import { app as gateway } from '../src/api-gateway';
import { app as accountApp } from '../src/account-service';
import { prisma } from '../src/shared/prisma';
import { hashPassword } from '../src/shared/auth';
import { recoverPayment } from '../src/payment-service/services/recovery.service';
import { setFaultInjectionHook } from '../src/payment-service/services/payment.service';

const suffix = randomUUID().slice(0, 8);
const password = randomUUID();
const accountServer = createServer(accountApp);
const gatewayServer = createServer(gateway);
const authServer = createServer(authApp);
let rejectCommit = false;
let competingPaymentId: string | undefined;
const studentServer = createServer(async (req, res) => {
  if (competingPaymentId && req.url?.endsWith('/commit')) {
    const id = req.url.split('/')[3];
    try {
      await prisma.tuitionFee.update({
        where: { id }, data: { status: 'PAID', reservedPaymentId: competingPaymentId },
      });
    } catch {
      res.writeHead(500).end();
      return;
    }
  }
  if (rejectCommit && req.url?.endsWith('/commit')) {
    res.writeHead(409).end();
    return;
  }
  studentApp(req, res);
});
const paymentServer = createServer(paymentApp);
let drop = '';
const proxy = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks);
  const response = await fetch(base(accountServer) + req.url, {
    method: req.method,
    headers: { 'content-type': 'application/json', 'x-account-service-token': req.headers['x-account-service-token'] as string || '', authorization: req.headers.authorization || '' },
    body: body.length ? body : undefined,
  });
  const text = await response.text();
  if (drop && req.url?.endsWith(drop)) { drop = ''; res.destroy(); return; }
  res.writeHead(response.status, { 'content-type': 'application/json' });
  res.end(text);
});
function base(server: typeof proxy) { return 'http://127.0.0.1:' + (server.address() as AddressInfo).port; }
async function request(path: string, body?: unknown, token?: string, key?: string) {
  const response = await fetch(base(gatewayServer) + '/api' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
let sequence = 0;
async function fixture(balance = 10000000, amount = 7000000) {
  const code = 'E' + suffix.slice(0, 4).toUpperCase() + String(++sequence).padStart(3, '0');
  const user = await prisma.user.create({ data: {
    username: code, passwordHash: await hashPassword(password), fullName: 'Kiểm thử E2E',
    email: code + '@ibanking.test', phone: '0900000000',
  } });
  const account = await prisma.account.create({ data: { id: 'A-' + randomUUID(), balance, userId: user.id } });
  const student = await prisma.student.create({ data: {
    studentCode: code, fullName: 'Sinh viên demo', email: code + '@ibanking.test', phone: '0900000000',
    faculty: 'CNTT', tuitionFees: { create: { semester: 'E2E', amount } },
  }, include: { tuitionFees: true } });
  const login = await request('/auth/login', { username: code, password });
  assert.equal(login.status, 200);
  return { user, student, token: login.body.data.accessToken as string, accountId: account.id };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function intent(f: Fixture, student = f.student) {
  return request('/payments/create-intent', { studentCode: student.studentCode, tuitionFeeId: student.tuitionFees[0].id }, f.token);
}
async function confirm(f: Fixture, id: string) {
  const mailpit = process.env.MAILPIT_ORIGIN || 'http://127.0.0.1:8025';
  const list = await (await fetch(mailpit + '/api/v1/search?query=' + encodeURIComponent('to:' + f.user.email))).json();
  for (const summary of list.messages) {
    if (!summary.Subject.includes('OTP')) continue;
    const message = await (await fetch(mailpit + '/api/v1/message/' + summary.ID)).json();
    if (!message.HTML.includes(id)) continue;
    const otp = message.HTML.match(/>([0-9]{6})<\/p>/)?.[1];
    assert.ok(otp, 'Thiếu OTP trong email thử nghiệm');
    return request('/payments/confirm-otp', { paymentId: id, otpCode: otp }, f.token);
  }
  throw new Error('Không tìm thấy email OTP cho paymentId');
}
async function balance(f: Fixture) {
  return (await prisma.account.findUniqueOrThrow({ where: { id: f.accountId } })).balance;
}
async function restartWorker() {
  const child = spawn(process.execPath, ['dist/src/payment-service/recover-once.js'], {
    env: { ...process.env, RECOVER_FORCE: '1' }, windowsHide: true, stdio: 'pipe',
  });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, errors);
}
before(async () => {
  assert.match(new URL(process.env.DATABASE_URL || '').searchParams.get('schema') || '', /^micro_test_/,
    'TC ghi dữ liệu, chỉ chạy trên schema riêng micro_test_*');
  for (const server of [accountServer, proxy, gatewayServer, authServer, studentServer, paymentServer]) {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
  }
  process.env.ACCOUNT_SERVICE_URL = base(proxy) + '/api';
  process.env.ACCOUNT_SERVICE_ORIGIN = base(accountServer);
  process.env.AUTH_SERVICE_ORIGIN = base(authServer);
  process.env.STUDENT_SERVICE_ORIGIN = base(studentServer);
  process.env.PAYMENT_SERVICE_ORIGIN = base(paymentServer);
  assert.ok(process.env.NOTIFICATION_SERVICE_URL, 'Test yêu cầu Notification thật');
});
after(async () => {
  setFaultInjectionHook(null);
  for (const server of [gatewayServer, proxy, accountServer, authServer, studentServer, paymentServer]) server.close();
  await prisma.$disconnect();
});

test('TC01 Đăng nhập đúng', async () => { await fixture(); });
test('TC02 Sai mật khẩu', async () => {
  const f = await fixture();
  assert.equal((await request('/auth/login', { username: f.user.username, password: 'sai' })).status, 401);
});
test('TC03 Hồ sơ và số dư', async () => {
  const f = await fixture();
  assert.equal((await request('/auth/me', undefined, f.token)).body.data.userId, f.user.id);
  assert.equal((await request('/accounts/me/balance', undefined, f.token)).body.data.balance, 10000000);
});
test('TC04 MSSV tồn tại', async () => {
  const f = await fixture();
  assert.equal((await request('/students/' + f.student.studentCode, undefined, f.token)).status, 200);
});
test('TC05 MSSV không tồn tại', async () => {
  const f = await fixture();
  assert.equal((await request('/students/NOTFOUND', undefined, f.token)).status, 404);
});
test('TC06 Thanh toán OTP hợp lệ', async () => {
  const f = await fixture();
  const created = await intent(f);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const result = await confirm(f, created.body.data.paymentId);
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.data.status, 'COMPLETED');
  assert.equal(await balance(f), 3000000n);
  assert.equal((await confirm(f, created.body.data.paymentId)).status, 409);
});
test('TC07 OTP sai và hết hạn', async () => {
  const f = await fixture();
  const id = (await intent(f)).body.data.paymentId;
  assert.equal((await request('/payments/confirm-otp', { paymentId: id, otpCode: '000000' }, f.token)).status, 400);
  await prisma.otpCode.updateMany({ where: { paymentId: id }, data: { expiresAt: new Date(0) } });
  assert.equal((await confirm(f, id)).status, 400);
  assert.equal(await balance(f), 10000000n);
});
test('TC08 Thiếu số dư', async () => {
  const f = await fixture(1000);
  assert.equal((await intent(f)).status, 402);
  assert.equal(await balance(f), 1000n);
});
test('TC09 Học phí đã thanh toán', async () => {
  const f = await fixture();
  await confirm(f, (await intent(f)).body.data.paymentId);
  assert.equal((await intent(f)).status, 400);
});
test('TC10 Hai giao dịch vượt số dư đồng thời', async () => {
  const f = await fixture();
  const other = await fixture();
  const ids = await Promise.all([intent(f), intent(f, other.student)]);
  await Promise.all(ids.map(p => confirm(f, p.body.data.paymentId)));
  assert.equal(await balance(f), 3000000n);
  const states = await prisma.payment.findMany({ where: { accountId: f.accountId } });
  assert.deepEqual(states.map(p => p.status).sort(), ['COMPLETED', 'FAILED']);
});
test('TC11 Hai tài khoản cùng thanh toán một khoản phí', async () => {
  const a = await fixture(), b = await fixture();
  const pa = (await intent(a)).body.data.paymentId;
  const pb = (await intent(b, a.student)).body.data.paymentId;
  await Promise.all([confirm(a, pa), confirm(b, pb)]);
  await restartWorker();
  const states = await prisma.payment.findMany({ where: { id: { in: [pa, pb] } } });
  assert.deepEqual(states.map(p => p.status).sort(), ['COMPLETED', 'FAILED']);
  assert.equal(await balance(a) + await balance(b), 13000000n);
  assert.equal(await prisma.accountDebit.count({ where: { paymentId: { in: [pa, pb] } } }), 1);
});
test('TC12 Retry debit cùng paymentId', async () => {
  const f = await fixture();
  const id = (await intent(f)).body.data.paymentId;
  await confirm(f, id);
  const responses = await Promise.all(Array.from({ length: 5 }, () =>
    fetch(base(proxy) + '/api/accounts/deduct', { method: 'POST', headers: { 'content-type': 'application/json', 'x-account-service-token': process.env.ACCOUNT_SERVICE_TOKEN! },
      body: JSON.stringify({ paymentId: id, accountId: f.accountId, amount: 7000000 }) })));
  assert.ok(responses.every(r => r.status === 200));
  assert.equal(await balance(f), 3000000n);
});
test('TC13 Mất phản hồi debit/refund và khởi động tiến trình phục hồi mới', async () => {
  const f = await fixture();
  const id = (await intent(f)).body.data.paymentId;
  drop = 'deduct';
  assert.equal((await confirm(f, id)).status, 202);
  assert.equal(await balance(f), 3000000n);
  assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id } })).status, 'PROCESSING');
  await restartWorker();
  assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id } })).status, 'COMPLETED');
  assert.equal(await balance(f), 3000000n);

  const g = await fixture();
  const refundId = (await intent(g)).body.data.paymentId;
  setFaultInjectionHook(() => { throw new Error('Lỗi sau debit'); });
  drop = 'refund';
  try { assert.equal((await confirm(g, refundId)).status, 202); }
  finally { setFaultInjectionHook(null); }
  assert.equal(await balance(g), 10000000n);
  assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: refundId } })).status, 'REFUND_PENDING');
  await restartWorker();
  assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: refundId } })).status, 'FAILED');
  await recoverPayment(refundId);
  assert.equal(await balance(g), 10000000n);
});
test('TC13b Commit bị từ chối lâu dài, dừng retry và giữ số dư để đối soát', async () => {
  const f = await fixture();
  const id = (await intent(f)).body.data.paymentId;
  rejectCommit = true;
  try {
    assert.equal((await confirm(f, id)).status, 202);
    await prisma.payment.update({ where: { id }, data: { recoveryAttempts: 29 } });
    const result = await recoverPayment(id);
    assert.equal(result.status, 'REVIEW_REQUIRED');
    assert.match(result.failureReason || '', /commit.*409/);
  } finally { rejectCommit = false; }
  await restartWorker();
  assert.equal(await balance(f), 3000000n);
  assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id } })).status, 'REVIEW_REQUIRED');
  assert.equal((await prisma.tuitionFee.findUniqueOrThrow({ where: { id: f.student.tuitionFees[0].id } })).status, 'UNPAID');
});

test('TC13c Worker đóng intent cũ thiếu OTP', async () => {
  const f = await fixture();
  const id = (await intent(f)).body.data.paymentId;
  await prisma.otpCode.deleteMany({ where: { paymentId: id } });
  await prisma.payment.update({ where: { id }, data: { createdAt: new Date(Date.now() - 360000) } });
  await restartWorker();
  assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id } })).status, 'EXPIRED');
  assert.equal(await balance(f), 10000000n);
});
test('TC13d Student xác nhận PAID cho ID khác, tự hoàn tiền đúng một lần', async () => {
  const f = await fixture();
  const id = (await intent(f)).body.data.paymentId;
  const otherId = randomUUID();
  competingPaymentId = otherId;
  try { assert.equal((await confirm(f, id)).status, 409); }
  finally { competingPaymentId = undefined; }
  await restartWorker();
  assert.equal(await balance(f), 10000000n);
  assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id } })).status, 'FAILED');
  const ledger = await prisma.accountDebit.findUniqueOrThrow({ where: { paymentId: id } });
  assert.equal(ledger.remainingBalance, 3000000n);
  assert.equal(ledger.refundedBalance, 10000000n);
  const fee = await prisma.tuitionFee.findUniqueOrThrow({ where: { id: f.student.tuitionFees[0].id } });
  assert.equal(fee.reservedPaymentId, otherId);
});
test('TC14 Lịch sử và số dư sau thanh toán', async () => {
  const f = await fixture();
  const id = (await intent(f)).body.data.paymentId;
  await confirm(f, id);
  const history = await request('/accounts/me/transactions', undefined, f.token);
  assert.equal(history.body.data[0].id, id);
  assert.equal(history.body.data[0].status, 'COMPLETED');
  assert.equal((await request('/accounts/me/balance', undefined, f.token)).body.data.balance, 3000000);
});
test('TC15 Email OTP và biên nhận tới Mailpit qua Notification thật', async () => {
  const f = await fixture();
  const id = (await intent(f)).body.data.paymentId;
  const messages = async () => {
    const data = await (await fetch((process.env.MAILPIT_ORIGIN || 'http://127.0.0.1:8025') + '/api/v1/messages')).json();
    return data.messages.filter((m: any) => m.To.some((to: any) => to.Address === f.user.email));
  };
  assert.equal((await messages()).length, 1);
  await confirm(f, id);
  let mail = await messages();
  for (let attempt = 0; mail.length < 2 && attempt < 24; attempt++) {
    await setTimeout(500);
    mail = await messages();
  }
  assert.equal(mail.length, 2);
  assert.ok(mail.some((m: any) => m.Subject.includes('OTP')));
  assert.ok(mail.some((m: any) => m.Subject.includes('thành công')));
});

test('Hai request tạo intent cùng khóa chỉ tạo một Payment', async () => {
  const f = await fixture();
  const body = { studentCode: f.student.studentCode, tuitionFeeId: f.student.tuitionFees[0].id, amount: 7000000 };
  const key = randomUUID();
  const responses = await Promise.all([
    request('/payments/create-intent', body, f.token, key),
    request('/payments/create-intent', body, f.token, key),
  ]);
  assert.ok(responses.every(result => result.status === 201));
  assert.equal(responses[0].body.data.paymentId, responses[1].body.data.paymentId);
  assert.equal(await prisma.payment.count({ where: { accountId: f.accountId } }), 1);
  assert.equal((await request('/payments/create-intent', { ...body, amount: 1 }, f.token, key)).status, 409);
});
