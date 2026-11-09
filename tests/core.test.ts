import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { once } from 'node:events';
import { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { app as gateway } from '../src/api-gateway';
import { app as account } from '../src/account-service';
import { changeBalance } from '../src/account-service/debit';
import { app as auth } from '../src/auth-service';
import { hashPassword, issueToken, verifyPassword } from '../src/shared/auth';
import { prisma } from '../src/shared/prisma';

const jwtSecret = randomBytes(32).toString('hex');
const serviceToken = randomBytes(32).toString('hex');
process.env.JWT_SECRET = jwtSecret;
process.env.ACCOUNT_SERVICE_TOKEN = serviceToken;
const databaseTests = process.env.RUN_CORE_DB_TESTS === '1';
const userId = randomUUID();
const accountId = `test-${userId}`;
const username = accountId;
const otherUserId = randomUUID();
const otherAccountId = `test-${otherUserId}`;
const studentId = randomUUID();
const tuitionFeeId = randomUUID();
const historyId = randomUUID();
const otherHistoryId = randomUUID();
const password = randomBytes(24).toString('hex');
const authHeader = { authorization: `Bearer ${issueToken(userId).accessToken}` };

const gatewayServer = gateway.listen(0, '127.0.0.1');
const accountServer = account.listen(0, '127.0.0.1');
const authServer = auth.listen(0, '127.0.0.1');
function url(server: typeof gatewayServer, route: string) {
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}${route}`;
}
function get(route: string, headers?: Record<string, string>) {
  return fetch(url(gatewayServer, route), { headers });
}
function post(server: typeof gatewayServer, route: string, body: unknown, headers?: Record<string, string>) {
  return fetch(url(server, route), {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
function debit(paymentId: string, amount: number, action = 'deduct') {
  return post(accountServer, `/api/accounts/${action}`, { accountId, amount, paymentId },
    { 'x-account-service-token': serviceToken });
}

async function balance() {
  const res = await get('/api/accounts/me/balance', authHeader);
  assert.equal(res.status, 200);
  return (await res.json()).data.balance;
}

before(async () => {
  await Promise.all([gatewayServer, accountServer, authServer].map((server) => once(server, 'listening')));
  if (databaseTests) {
    const hash = await hashPassword(password);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO users (id, username, password_hash, full_name, email, phone)
        VALUES (${userId}::uuid, ${username}, ${hash}, 'Test', 'test@example.test', '0900000000')
      `;
      await tx.user.create({ data: {
        id: otherUserId, username: otherAccountId, passwordHash: hash,
        fullName: 'Test khác', email: 'other@example.test', phone: '0900000000',
      } });
      await tx.account.create({ data: { id: otherAccountId, userId: otherUserId, balance: 0n } });
      await tx.student.create({ data: {
        id: studentId, studentCode: userId.slice(0, 20).toUpperCase(), fullName: 'Test sinh viên',
        email: 'student@example.test', phone: '0900000000', faculty: 'Test',
      } });
      await tx.tuitionFee.create({ data: {
        id: tuitionFeeId, studentId, semester: 'TEST', amount: 1000,
      } });
      await tx.payment.createMany({ data: [
        { id: historyId, accountId, studentId, tuitionFeeId, amount: 1000, status: 'COMPLETED',
          transactionReference: historyId, payerEmail: 'test@example.test' },
        { id: otherHistoryId, accountId: otherAccountId, studentId, tuitionFeeId, amount: 1000,
          transactionReference: otherHistoryId, payerEmail: 'other@example.test' },
      ] });
      await tx.$executeRaw`
        INSERT INTO accounts (id, user_id, balance) VALUES (${accountId}, ${userId}::uuid, 10000000)
      `;
    });
  }
});

after(async () => {
  gatewayServer.close();
  accountServer.close();
  authServer.close();
  try {
    if (databaseTests) {
      await prisma.$transaction([
        prisma.payment.deleteMany({ where: { id: { in: [historyId, otherHistoryId] } } }),
        prisma.tuitionFee.deleteMany({ where: { id: tuitionFeeId } }),
        prisma.student.deleteMany({ where: { id: studentId } }),
        prisma.account.deleteMany({ where: { id: otherAccountId } }),
        prisma.user.deleteMany({ where: { id: otherUserId } }),
        prisma.$executeRaw`DELETE FROM account_debits WHERE account_id = ${accountId}`,
        prisma.$executeRaw`DELETE FROM accounts WHERE id = ${accountId}`,
        prisma.$executeRaw`DELETE FROM users WHERE id = ${userId}::uuid`,
      ]);
    }
  } finally {
    await prisma.$disconnect();
  }
});

test('Mật khẩu scrypt có salt, kiểm tra đúng và sai', async () => {
  const hash = await hashPassword(password);
  assert.notEqual(hash, await hashPassword(password));
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword('sai', hash), false);
  assert.equal(await verifyPassword(password), false);
});

test('Gateway từ chối token thiếu, sửa chữ ký, hoặc hết hạn', async () => {
  const [header, payload, signature] = issueToken(userId).accessToken.split('.');
  const expiredPayload = Buffer.from(JSON.stringify({
    ...JSON.parse(Buffer.from(payload, 'base64url').toString()), exp: 1,
  })).toString('base64url');
  const expired = `${header}.${expiredPayload}`;
  const expiredSignature = createHmac('sha256', jwtSecret).update(expired).digest('base64url');
  const tampered = `${header}.${payload}.${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
  const invalidHeaders: Record<string, string>[] = [
    { 'x-user-id': userId },
    { authorization: `Bearer ${tampered}` },
    { authorization: `Bearer ${expired}.${expiredSignature}` },
  ];
  for (const headers of invalidHeaders) {
    assert.equal((await get('/api/auth/me', headers)).status, 401);
    assert.equal((await get('/api/accounts/me', headers)).status, 401);
  }
});

test('Gateway chặn debit nội bộ, sửa học phí trực tiếp và đọc Student thiếu JWT', async () => {
  const input = { accountId, paymentId: randomUUID(), amount: 1 };
  const headers = { ...authHeader, 'x-account-service-token': serviceToken };
  assert.equal((await post(gatewayServer, '/api/accounts/deduct', input, headers)).status, 404);
  assert.equal((await post(accountServer, '/api/accounts/deduct', input, authHeader)).status, 401);
  assert.equal((await fetch(url(gatewayServer, '/api/tuitions/id/pay'), { method: 'PATCH', headers })).status, 404);
  assert.equal((await get('/api/students/521H0001')).status, 401);
});

test('Swagger JSON của Auth và Account có contract tương ứng', async () => {
  for (const [server, endpoint] of [
    [authServer, '/api/auth/login'], [accountServer, '/api/accounts/deduct'],
  ] as const) {
    const html = await fetch(url(server, '/docs/'));
    assert.equal(html.status, 200);
    assert.match(await html.text(), /swagger-ui/);
    const response = await fetch(url(server, '/docs.json'));
    assert.equal(response.status, 200);
    const document = await response.json();
    assert.equal(document.openapi, '3.0.3');
    assert.ok(document.paths[endpoint].post.responses['200']);
  }
});

test('Đăng nhập đúng/sai, JWT hợp lệ và lọc định danh qua Gateway', { skip: !databaseTests }, async () => {
  const login = await post(gatewayServer, '/api/auth/login', { username, password });
  assert.equal(login.status, 200);
  const session = (await login.json()).data;
  const headers = { authorization: `Bearer ${session.accessToken}`, 'x-user-id': randomUUID() };
  const me = await get('/api/auth/me', headers);
  assert.equal(me.status, 200);
  const profile = (await me.json()).data;
  assert.equal(profile.userId, userId);
  assert.equal(profile.accountId, accountId);
  assert.ok(!('password_hash' in profile));
  assert.equal((await post(gatewayServer, '/api/auth/login', { username, password: 'sai' })).status, 401);
  assert.equal((await post(gatewayServer, '/api/auth/login', { username: 'khong-ton-tai', password })).status, 401);
  const history = await get('/api/accounts/me/transactions', headers);
  assert.equal(history.status, 200);
  assert.deepEqual((await history.json()).data.map((record: { id: string }) => record.id), [historyId]);
  assert.equal((await get(`/api/payments/${historyId}`, headers)).status, 200);
  assert.equal((await get(`/api/payments/${otherHistoryId}`, headers)).status, 404);
  assert.equal((await post(gatewayServer, '/api/payments/confirm-otp', {
    paymentId: otherHistoryId, otpCode: '000000',
  }, headers)).status, 404);
  assert.equal((await get('/api/payments/account/ACC-OTHER', headers)).status, 404);
  assert.equal((await get(`/api/payments/account/${accountId}`, headers)).status, 200);
  assert.equal((await get('/api/students/99999999', headers)).status, 404);
});

test('Hai debit 7 triệu đồng thời trên số dư 10 triệu', { skip: !databaseTests }, async () => {
  const results = await Promise.all([debit(randomUUID(), 7000000), debit(randomUUID(), 7000000)]);
  assert.deepEqual(results.map((res) => res.status).sort(), [200, 402]);
  assert.equal(await balance(), 3000000);
});

test('Debit retry đồng thời, xung đột amount và refund đồng thời', { skip: !databaseTests }, async () => {
  const paymentId = randomUUID();
  const results = await Promise.all(Array.from({ length: 6 }, () => debit(paymentId, 1000000)));
  for (const res of results) {
    assert.equal(res.status, 200);
    assert.equal((await res.json()).data.remainingBalance, 2000000);
  }
  assert.equal(await balance(), 2000000);
  assert.equal((await debit(paymentId, 2000000)).status, 409);
  const otherAccount = await post(accountServer, '/api/accounts/deduct',
    { accountId: otherAccountId, paymentId, amount: 1000000 }, { 'x-account-service-token': serviceToken });
  assert.equal(otherAccount.status, 409);
  assert.equal((await otherAccount.json()).errors.code, 'PAYMENT_CONFLICT');
  const refunds = await Promise.all([debit(paymentId, 1000000, 'refund'), debit(paymentId, 1000000, 'refund')]);
  for (const res of refunds) {
    assert.equal(res.status, 200);
    assert.equal((await res.json()).data.balance, 3000000);
  }
  assert.equal((await debit(paymentId, 1000000)).status, 409);
  assert.equal(await balance(), 3000000);
});

test('Không đủ tiền, retry giữ nguyên kết quả', { skip: !databaseTests }, async () => {
  const paymentId = randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await debit(paymentId, 4000000);
    assert.equal(result.status, 402);
    assert.equal((await result.json()).errors.code, 'INSUFFICIENT_BALANCE');
  }
  assert.equal(await balance(), 3000000);
});

test('Rollback sau UPDATE số dư rồi retry cùng paymentId', { skip: !databaseTests }, async () => {
  const paymentId = randomUUID();
  const beforeBalance = await balance();
  await assert.rejects(changeBalance({ accountId, paymentId, amount: 1000 }, 'debit', () => {
    throw new Error('Lỗi kiểm thử sau UPDATE');
  }), /Lỗi kiểm thử/);
  assert.equal(await balance(), beforeBalance);
  const [entry] = await prisma.$queryRaw<unknown[]>`
    SELECT payment_id FROM account_debits WHERE payment_id = ${paymentId}::uuid
  `;
  assert.equal(entry, undefined);
  assert.equal((await debit(paymentId, 1000)).status, 200);
  assert.equal(await balance(), beforeBalance - 1000);
});




test('CHECK PostgreSQL chặn số dư âm khi ghi trực tiếp', { skip: !databaseTests }, async () => {
  const beforeBalance = await balance();
  await assert.rejects(
    prisma.$executeRaw`UPDATE accounts SET balance = -1 WHERE id = ${accountId}`,
    /accounts_balance_range/,
  );
  assert.equal(await balance(), beforeBalance);
});


