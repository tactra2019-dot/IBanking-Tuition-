import 'dotenv/config';
import { prisma } from '../src/shared/prisma';
import { hashPassword } from '../src/shared/auth';

async function resetPassword() {
  const schema = new URL(process.env.DATABASE_URL || '').searchParams.get('schema') || '';
  if (!/^micro_[a-z0-9_]{1,35}$/.test(schema)) {
    throw new Error('Chỉ được đặt lại mật khẩu trên schema micro_*');
  }

  const username = process.env.RESET_USERNAME?.trim();
  const password = process.env.RESET_PASSWORD;
  if (!username || username.length > 80) {
    throw new Error('Đặt RESET_USERNAME cho tài khoản cần đổi mật khẩu');
  }
  if (!password || password.length < 12 || Buffer.byteLength(password) > 1024) {
    throw new Error('RESET_PASSWORD phải dài từ 12 ký tự và tối đa 1024 byte');
  }

  const passwordHash = await hashPassword(password);
  const result = await prisma.user.updateMany({
    where: { username },
    data: { passwordHash },
  });
  if (result.count !== 1) {
    throw new Error('Không tìm thấy tài khoản: ' + username);
  }
  console.log('Đã đặt lại mật khẩu cho tài khoản: ' + username);
}

resetPassword()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
