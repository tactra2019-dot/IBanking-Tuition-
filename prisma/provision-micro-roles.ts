import 'dotenv/config';
import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
import { prisma } from '../src/shared/prisma';

const roles = {
  AUTH: ['users'],
  ACCOUNT: ['accounts', 'account_debits'],
  STUDENT: ['students', 'tuition_fees'],
  PAYMENT: ['payments', 'otp_codes'],
} as const;

async function provision() {
  const url = new URL(process.env.DATABASE_URL || '');
  const schema = url.searchParams.get('schema') || '';
  if (!/^micro_[a-z0-9_]{1,35}$/.test(schema)) throw new Error('Chỉ cấp quyền trên schema micro_* mới');
  const output = '.env.micro-roles.local';
  if (existsSync(output)) throw new Error('File kết nối đã tồn tại: ' + output);
  const suffix = createHash('sha256').update(url.pathname + schema).digest('hex').slice(0, 12);
  const lines: string[] = [];
  // Tên schema được kiểm tra, tên role và mật khẩu do script sinh.
  await prisma.$transaction(async tx => {
    for (const [service, tables] of Object.entries(roles)) {
      const role = 'micro_' + service.toLowerCase() + '_' + suffix;
      const password = randomBytes(24).toString('hex');
      await tx.$executeRawUnsafe(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}'`);
      await tx.$executeRawUnsafe(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
      for (const table of tables) {
        await tx.$executeRawUnsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON "${schema}"."${table}" TO "${role}"`);
      }
      const serviceUrl = new URL(url);
      serviceUrl.username = role;
      serviceUrl.password = password;
      lines.push(service + '_DATABASE_URL=' + serviceUrl.href);
    }
    writeFileSync(output, lines.join('\n') + '\n', { flag: 'wx' });
  });
  console.log('Đã cấp quyền theo bảng cho bốn service. Xem tên biến trong ' + output);
}

provision().catch(() => {
  console.error('Cấp quyền thất bại. Kiểm tra schema, quyền CREATEROLE và file cấu hình local.');
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
