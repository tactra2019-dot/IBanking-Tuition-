export interface AccountInfo {
  accountId: string;
  fullName: string;
  email: string;
  phone: string;
  balance: number;
}

const getBaseUrl = () => process.env.ACCOUNT_SERVICE_URL || 'http://localhost:4003/api';

export const accountClient = {
  async getAccount(accountId: string): Promise<{ ok: boolean; status?: number; data?: AccountInfo; message?: string }> {
    try {
      const res = await fetch(`${getBaseUrl()}/accounts/${encodeURIComponent(accountId)}`);
      const body: any = await res.json();
      if (!res.ok) return { ok: false, status: res.status, message: body.message || 'Không tìm thấy tài khoản' };
      return { ok: true, data: body.data ?? body };
    } catch {
      return { ok: false, status: 503, message: 'Account Service hiện không phản hồi' };
    }
  },

  async deductBalance(
    accountId: string,
    amount: number,
    paymentId: string
  ): Promise<{ ok: boolean; status?: number; message?: string }> {
    try {
      const res = await fetch(`${getBaseUrl()}/accounts/deduct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, amount, paymentId }),
      });
      const body: any = await res.json();
      if (!res.ok) {
        return { ok: false, status: res.status, message: body.message || 'Trừ tiền tài khoản thất bại' };
      }
      return { ok: true };
    } catch {
      return { ok: false, status: 503, message: 'Account Service không phản hồi khi trừ tiền' };
    }
  },

  async refundBalance(
    accountId: string,
    amount: number,
    paymentId: string
  ): Promise<{ ok: boolean; message?: string }> {
    try {
      const res = await fetch(`${getBaseUrl()}/accounts/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, amount, paymentId }),
      });
      const body: any = await res.json();
      if (!res.ok) return { ok: false, message: body.message || 'Hoàn tiền thất bại' };
      return { ok: true };
    } catch {
      return { ok: false, message: 'Account Service không phản hồi khi hoàn tiền bù trừ' };
    }
  },
};
