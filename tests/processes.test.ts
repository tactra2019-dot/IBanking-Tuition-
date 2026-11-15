import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout } from 'node:timers/promises';
import { test } from 'node:test';
import { Prisma, PrismaClient } from '@ibanking/db';
import { hashPassword } from '../src/shared/auth';

test('Khởi động và dừng từng tiến trình Node bằng role riêng', async () => {
  const services = [
    ['auth-service', 'PORT_AUTH', 'AUTH_DATABASE_URL', 14104],
    ['account-service', 'PORT_ACCOUNT', 'ACCOUNT_DATABASE_URL', 14103],
    ['student-service', 'PORT_STUDENT', 'STUDENT_DATABASE_URL', 14101],
    ['payment-service', 'PORT_PAYMENT', 'PAYMENT_DATABASE_URL', 14102],
    ['api-gateway', 'PORT_GATEWAY', null, 14100],
  ] as const;
  const env = {
    ...process.env, SERVICE_HOST: '127.0.0.1', GATEWAY_HOST: '127.0.0.1',
    AUTH_SERVICE_ORIGIN: 'http://127.0.0.1:14104',
    ACCOUNT_SERVICE_ORIGIN: 'http://127.0.0.1:14103',
    ACCOUNT_SERVICE_URL: 'http://127.0.0.1:14103/api',
    STUDENT_SERVICE_ORIGIN: 'http://127.0.0.1:14101',
    PAYMENT_SERVICE_ORIGIN: 'http://127.0.0.1:14102',
  };
  const health = (port: number) => fetch('http://127.0.0.1:' + port + '/health', { signal: AbortSignal.timeout(600) });
  const start = ([service, portVariable, dbVariable, port]: typeof services[number]) => {
    const database = dbVariable ? process.env[dbVariable] : undefined;
    return spawn(process.execPath, ['dist/src/' + service + '/index.js'], {
      env: { ...env, [portVariable]: String(port), DATABASE_URL: database || '' },
      stdio: 'ignore', windowsHide: true,
    });
  };
  const waitForHealth = async (service: string, port: number, child: ReturnType<typeof start>) => {
    for (let attempt = 0; attempt < 40; attempt++) {
      if ((await health(port).catch(() => undefined))?.ok) return;
      if (child.exitCode !== null) break;
      await setTimeout(200);
    }
    assert.fail(service + ' không khởi động');
  };
  for (const [, , dbVariable] of services) {
    if (dbVariable) assert.match(new URL(process.env[dbVariable] || '').searchParams.get('schema') || '', /^micro_test_/);
  }
  const children = services.map(start);
  try {
    for (const [index, [service, , , port]] of services.entries()) await waitForHealth(service, port, children[index]);
    const owners = [
      ['AUTH_DATABASE_URL', 'users', 'payments'],
      ['ACCOUNT_DATABASE_URL', 'accounts', 'users'],
      ['STUDENT_DATABASE_URL', 'tuition_fees', 'accounts'],
      ['PAYMENT_DATABASE_URL', 'payments', 'tuition_fees'],
    ] as const;
    for (const [variable, owned, foreign] of owners) {
      const client = new PrismaClient({ datasourceUrl: process.env[variable] });
      try {
        await client.$queryRaw(Prisma.sql`SELECT 1 FROM ${Prisma.raw(owned)} LIMIT 1`);
        await assert.rejects(client.$queryRaw(Prisma.sql`SELECT 1 FROM ${Prisma.raw(foreign)} LIMIT 1`), /denied|permission|quyền/i);
      } finally { await client.$disconnect(); }
    }

    // Fixture chỉ được tạo trong schema thử, các tiến trình dùng URL role riêng.
    assert.match(new URL(process.env.DATABASE_URL || '').searchParams.get('schema') || '', /^micro_test_/);
    const db = new PrismaClient();
    try {
      const password = randomUUID();
      const studentCode = 'S' + randomUUID().replaceAll('-', '').slice(0, 9).toUpperCase();
      const email = studentCode + '@ibanking.test';
      const user = await db.user.create({ data: {
        username: studentCode, fullName: 'Kiểm thử tiến trình', email, phone: '0900000000',
        passwordHash: await hashPassword(password),
      } });
      const account = await db.account.create({ data: { id: 'A-' + randomUUID(), userId: user.id, balance: 10000 } });
      await db.student.create({ data: {
        studentCode, fullName: user.fullName, email, phone: user.phone, faculty: 'CNTT',
        tuitionFees: { create: { semester: 'TEST', amount: 7000 } },
      } });
      let authorization = '';
      const api = async (route: string, body?: object) => {
        const response = await fetch('http://127.0.0.1:14100/api' + route, {
          method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: authorization },
          body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(14100),
        });
        const payload = await response.json();
        assert.ok(response.ok, route + ': ' + payload.message);
        return payload.data;
      };
      authorization = 'Bearer ' + (await api('/auth/login', { username: studentCode, password })).accessToken;
      const tuition = await api('/tuitions/student/' + studentCode);
      const payment = await api('/payments/create-intent', { studentCode, tuitionFeeId: tuition.id, amount: tuition.amount });
      const mailpit = process.env.MAILPIT_ORIGIN || 'http://127.0.0.1:8025';
      const messages = await (await fetch(mailpit + '/api/v1/search?query=' + encodeURIComponent('to:' + email))).json();
      const summary = messages.messages.find((message: { Subject: string }) => message.Subject.includes('OTP'));
      assert.ok(summary);
      const message = await (await fetch(mailpit + '/api/v1/message/' + summary.ID)).json();
      const otpCode = message.HTML.match(/>([0-9]{6})<\/p>/)?.[1];
      assert.ok(otpCode);
      assert.equal((await api('/payments/confirm-otp', { paymentId: payment.paymentId, otpCode })).status, 'COMPLETED');
      assert.equal((await api('/accounts/me/balance')).balance, 3000);
      assert.equal((await api('/tuitions/student/' + studentCode)).status, 'PAID');
      assert.equal((await api('/accounts/me/transactions'))[0].id, payment.paymentId);
      assert.equal(await db.accountDebit.count({ where: { accountId: account.id } }), 1);
    } finally { await db.$disconnect(); }

    for (const [index, [, , , port]] of services.entries()) {
      const exited = once(children[index], 'exit');
      children[index].kill();
      await exited;
      await assert.rejects(health(port));
      for (const [otherIndex, [, , , otherPort]] of services.entries()) {
        if (otherIndex !== index) assert.ok((await health(otherPort)).ok);
      }
      children[index] = start(services[index]);
      await waitForHealth(services[index][0], port, children[index]);
    }
  } finally {
    for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill();
  }
});
