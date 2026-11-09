import { Prisma } from '@prisma/client';
import { prisma } from '../shared/prisma';

const accountFields = {
  id: true,
  balance: true,
  user: { select: { fullName: true, email: true, phone: true } },
} satisfies Prisma.AccountSelect;

export type AccountInfo = Prisma.AccountGetPayload<{ select: typeof accountFields }>;

export function accountForUser(userId: string) {
  return prisma.account.findUnique({ where: { userId }, select: accountFields });
}

export function accountById(id: string) {
  return prisma.account.findUnique({ where: { id }, select: accountFields });
}

export function serializeAccount(account: AccountInfo) {
  return { accountId: account.id, ...account.user, balance: Number(account.balance) };
}
