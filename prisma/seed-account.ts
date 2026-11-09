import 'dotenv/config';
import { hashPassword } from '../src/shared/auth';
import { prisma } from '../src/shared/prisma';

async function seed() {
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 12 || Buffer.byteLength(password) > 1024) {
    throw new Error('Cấu hình DEMO_PASSWORD từ 12 ký tự và tối đa 1024 byte');
  }

  for (const [username, accountId, balance] of [
    ['demo1', 'ACC-001', 50000000n],
    ['demo2', 'ACC-002', 30000000n],
  ] as const) {
    const hash = await hashPassword(password);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO users (username, password_hash, full_name, email, phone)
        VALUES (${username}, ${hash}, ${username}, ${process.env.DEMO_EMAIL || `${username}@example.test`}, '0900000000')
        ON CONFLICT (username) DO NOTHING
      `;
      await tx.$executeRaw`
        INSERT INTO accounts (id, user_id, balance)
        SELECT ${accountId}, id, ${balance} FROM users WHERE username = ${username}
        ON CONFLICT (id) DO NOTHING
      `;
    });
  }
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
