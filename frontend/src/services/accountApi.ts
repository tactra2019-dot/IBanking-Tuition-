import { client } from "./client";
import type { Account } from "../types";
export const accountApi = {
  get: async () => (await client.get<Account>("/accounts/me")).data,
};
