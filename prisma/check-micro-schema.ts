import 'dotenv/config';

const database = new URL(process.env.DATABASE_URL || '');
const schema = database.searchParams.get('schema') || '';
if (!/^micro_[a-z0-9_]{1,35}$/.test(schema)) {
  console.error('Lệnh này chỉ áp dụng cho schema mới có tên micro_*. Hãy kiểm tra DATABASE_URL.');
  process.exitCode = 1;
}
