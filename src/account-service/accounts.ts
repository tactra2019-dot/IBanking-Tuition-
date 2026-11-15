import { prisma } from '../shared/prisma';
import { internalToken } from '../shared/internal';

export function accountForUser(userId: string) {
  return prisma.account.findUnique({ where: { userId }, select: { id: true, userId: true, balance: true } });
}

export function accountById(id: string) {
  return prisma.account.findUnique({ where: { id }, select: { id: true, userId: true, balance: true } });
}

export type AccountInfo = NonNullable<Awaited<ReturnType<typeof accountForUser>>>;

export async function serializeAccount(account: AccountInfo) {
  const auth = process.env.AUTH_SERVICE_ORIGIN || 'http://127.0.0.1:4004';
  const response = await fetch(auth + '/internal/users/' + account.userId, {
    headers: { 'X-Internal-Key': internalToken('AUTH_SERVICE_TOKEN') },
    signal: AbortSignal.timeout(2500), redirect: 'error',
  });
  if (!response.ok) throw new Error('Không lấy được hồ sơ chủ tài khoản');
  const { data } = await response.json();
  return { accountId: account.id, ...data, balance: Number(account.balance) };
}
