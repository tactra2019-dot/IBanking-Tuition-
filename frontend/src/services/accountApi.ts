import { client, isDemo } from "./client";
import type { Account } from "../types";
export const accountApi = {
  get: async (): Promise<Account> => {
    const response = (await client.get("/accounts/me")).data;
    if (isDemo) return response;
    return { accountNumber: response.data.accountId, balance: response.data.balance, status: "ACTIVE", currency: "VND" };
  },
};
