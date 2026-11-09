import { test } from "node:test";
import assert from "node:assert/strict";
import { createBank } from "./domain.mjs";
import { createMockServer } from "./server.mjs";
const code = (expected) => (error) => error.code === expected;
test("invalid credentials rejected; sessions are revoked on logout", () => {
  const b = createBank();
  assert.throws(
    () => b.login("tai.demo", "wrong"),
    code("INVALID_CREDENTIALS"),
  );
  const { accessToken } = b.login("tai.demo", "Demo@123");
  b.authorize(accessToken);
  b.logout(accessToken);
  assert.throws(() => b.authorize(accessToken), code("UNAUTHORIZED"));
});
test("student not found, paid tuition, absent tuition, insufficient balance", () => {
  const b = createBank();
  assert.throws(() => b.student("99999999"), code("STUDENT_NOT_FOUND"));
  assert.throws(() => b.create("52200002", "a"), code("TUITION_UNAVAILABLE"));
  assert.throws(() => b.create("52200006", "b"), code("TUITION_UNAVAILABLE"));
  assert.throws(() => b.create("52200003", "c"), code("INSUFFICIENT_BALANCE"));
});
test("idempotent creation returns same transaction; parallel duplicate blocked", () => {
  const b = createBank();
  const p = b.create("52200001", "key");
  assert.equal(b.create("52200001", "key").id, p.id);
  assert.throws(() => b.create("52200004", "key"));
  assert.throws(() => b.create("52200001", "other"), code("PAYMENT_EXISTS"));
  assert.equal(b.account().balance, 15200000);
});
test("wrong OTP is rejected; successful OTP debits exactly once and marks tuition paid", () => {
  const b = createBank();
  const p = b.create("52200001", "a");
  assert.throws(() => b.verify(p.id, "000000"), code("OTP_INVALID"));
  assert.equal(b.account().balance, 15200000);
  assert.equal(b.verify(p.id, "123456").status, "SUCCESS");
  assert.equal(b.account().balance, 7700000);
  assert.equal(b.student("52200001").tuitionStatus, "PAID");
  assert.throws(() => b.verify(p.id, "123456"), code("OTP_USED"));
  assert.equal(b.account().balance, 7700000);
});
test("OTP expiry uses server time and permits explicit resend", () => {
  let clock = 1000000;
  const b = createBank({ now: () => clock });
  const p = b.create("52200001", "a");
  clock += 300001;
  assert.throws(() => b.verify(p.id, "123456"), code("OTP_EXPIRED"));
  const renewed = b.resend(p.id);
  assert.equal(Date.parse(renewed.expiresAt), clock + 300000);
  assert.equal(b.verify(p.id, "123456").status, "SUCCESS");
});
test("resend requires cooldown and allows no more than two requests", () => {
  let clock = 1000000;
  const b = createBank({ now: () => clock });
  const p = b.create("52200001", "a");
  assert.throws(() => b.resend(p.id), code("OTP_COOLDOWN"));
  clock += 30000;
  b.resend(p.id);
  clock += 30000;
  assert.equal(b.resend(p.id).canResend, false);
  clock += 30000;
  assert.throws(() => b.resend(p.id), code("OTP_LIMIT"));
});
test("five wrong attempts lock OTP; resends do not reset attempts", () => {
  let clock = 1000000;
  const b = createBank({ now: () => clock });
  const p = b.create("52200001", "a");
  for (let i = 0; i < 4; i++)
    assert.throws(() => b.verify(p.id, "000000"), code("OTP_INVALID"));
  clock += 30000;
  b.resend(p.id);
  assert.throws(() => b.verify(p.id, "000000"), code("OTP_INVALID"));
  assert.throws(() => b.verify(p.id, "123456"), code("OTP_ATTEMPTS_EXCEEDED"));
  assert.throws(() => b.resend(p.id), code("OTP_LIMIT"));
  assert.equal(b.account().balance, 15200000);
});
test("PROCESSING and FAILED never debit balance or mark tuition paid", () => {
  const b = createBank();
  const processing = b.create("52200004", "a");
  assert.equal(b.verify(processing.id, "123456").status, "PROCESSING");
  const failed = b.create("52200005", "b");
  assert.equal(b.verify(failed.id, "123456").status, "FAILED");
  assert.equal(b.account().balance, 15200000);
  assert.equal(b.student("52200004").tuitionStatus, "UNPAID");
  assert.equal(b.get(processing.id).status, "PROCESSING");
});
test("OTP verification rejects a missing or other transaction; no OTP leaked in response", () => {
  const b = createBank();
  const p = b.create("52200001", "a");
  assert.throws(
    () => b.verify("unrelated", "123456"),
    code("PAYMENT_NOT_FOUND"),
  );
  assert.equal("otp" in p, false);
  assert.equal("attempts" in p, false);
  assert.equal("used" in p, false);
});
test("history filters and paginates with reliable totals", () => {
  const b = createBank();
  assert.equal(b.list({ status: "SUCCESS" }).total, 2);
  assert.equal(b.list({ page: 2, pageSize: 2 }).items.length, 1);
  assert.equal(b.list({ status: "PROCESSING" }).items.length, 0);
});
test("HTTP contract: authorization, login, lookup, payment, OTP and response errors", async () => {
  const server = createMockServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/accounts/me`)).status, 401);
    const login = await fetch(`${base}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ username: "tai.demo", password: "Demo@123" }),
    });
    const { accessToken } = await login.json();
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Idempotency-Key": "http-test",
    };
    assert.equal(
      (await fetch(`${base}/students/99999999/tuition`, { headers })).status,
      404,
    );
    const create = await fetch(`${base}/payments`, {
      method: "POST",
      headers,
      body: JSON.stringify({ studentId: "52200001" }),
    });
    assert.equal(create.status, 201);
    const p = await create.json();
    const verified = await fetch(`${base}/payments/${p.id}/verify-otp`, {
      method: "POST",
      headers,
      body: JSON.stringify({ otp: "123456" }),
    });
    assert.equal((await verified.json()).status, "SUCCESS");
    assert.equal(
      (await fetch(`${base}/payments?page=-1`, { headers })).status,
      400,
    );
    assert.equal(
      (
        await fetch(`${base}/payments`, {
          method: "POST",
          headers,
          body: "null",
        })
      ).status,
      400,
    );
  } finally {
    await new Promise((r) => server.close(r));
  }
});
