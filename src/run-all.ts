import 'dotenv/config';
import { spawn, ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

const services = [
  ['auth-service', 'AUTH_DATABASE_URL'],
  ['account-service', 'ACCOUNT_DATABASE_URL'],
  ['student-service', 'STUDENT_DATABASE_URL'],
  ['payment-service', 'PAYMENT_DATABASE_URL'],
  ['api-gateway', null],
] as const;

for (const [, variable] of services) {
  if (variable && !process.env[variable]) throw new Error('Thiếu ' + variable);
}

const children: ChildProcess[] = [];
let stopping = false;
function stop(code: number) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill();
}

for (const [service, variable] of services) {
  const env = { ...process.env };
  if (variable) env.DATABASE_URL = process.env[variable];
  const child = spawn(process.execPath, [resolve('dist/src', service, 'index.js')], { stdio: 'inherit', env });
  children.push(child);
  child.once('error', () => stop(1));
  child.once('exit', code => stop(code ?? 1));
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
