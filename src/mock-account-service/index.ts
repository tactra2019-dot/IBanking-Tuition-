import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { sendError, sendSuccess } from '../shared/response';

export const app = express();
app.use(cors());
app.use(express.json());

export const accountsStore = new Map<string, { accountId: string; fullName: string; email: string; phone: string; balance: number }>();
const processedPayments = new Set<string>();

export function resetMockAccounts() {
  processedPayments.clear();
  accountsStore.clear();
  accountsStore.set('ACC-001', { accountId: 'ACC-001', fullName: 'Nguyễn Văn Phú', email: 'phu@tdtu.edu.vn', phone: '0909111222', balance: 50000000 });
  accountsStore.set('ACC-002', { accountId: 'ACC-002', fullName: 'Trần Minh Quân', email: 'quan@tdtu.edu.vn', phone: '0909333444', balance: 30000000 });
  accountsStore.set('ACC-LOW', { accountId: 'ACC-LOW', fullName: 'Lê Ít Tiền', email: 'low@tdtu.edu.vn', phone: '0909555666', balance: 5000000 });
  accountsStore.set('ACC-10M', { accountId: 'ACC-10M', fullName: 'Phạm Mười Triệu', email: '10m@tdtu.edu.vn', phone: '0909777888', balance: 10000000 });
}

resetMockAccounts();

app.get('/health', (_req, res) => res.json({ service: 'mock-account-service', status: 'ok' }));

app.get('/api/accounts/:accountId', (req, res) => {
  const acc = accountsStore.get(req.params.accountId);
  if (!acc) return sendError(res, 'Không tìm thấy tài khoản', 404);
  return sendSuccess(res, acc);
});

app.post('/api/accounts/deduct', (req, res) => {
  const { accountId, amount, paymentId } = req.body || {};
  const acc = accountsStore.get(String(accountId));
  if (!acc) return sendError(res, 'Không tìm thấy tài khoản', 404);

  const deductAmount = Number(amount);
  if (paymentId && processedPayments.has(String(paymentId))) {
    return sendError(res, 'Giao dịch này đã được trừ tiền (idempotency guard)', 409);
  }
  if (acc.balance < deductAmount) {
    return sendError(res, 'Số dư khả dụng không đủ', 402);
  }

  acc.balance -= deductAmount;
  if (paymentId) processedPayments.add(String(paymentId));
  return sendSuccess(res, { accountId: acc.accountId, remainingBalance: acc.balance }, 'Trừ tiền thành công');
});

app.post('/api/accounts/refund', (req, res) => {
  const { accountId, amount, paymentId } = req.body || {};
  const acc = accountsStore.get(String(accountId));
  if (!acc) return sendError(res, 'Không tìm thấy tài khoản', 404);
  if (paymentId && processedPayments.has(String(paymentId))) {
    acc.balance += Number(amount);
    processedPayments.delete(String(paymentId));
  }
  return sendSuccess(res, { accountId: acc.accountId, balance: acc.balance }, 'Hoàn tiền thành công');
});

if (require.main === module) {
  const port = Number(process.env.PORT_ACCOUNT_MOCK) || 4003;
  app.listen(port, () => console.log(`[mock-account-service] listening on http://localhost:${port}`));
}

