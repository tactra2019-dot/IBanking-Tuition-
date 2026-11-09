import { client } from "./client";
import type { Payment, PaymentList, Status } from "../types";
export const paymentApi = {
  list: async (page = 1, status: Status | "" = "") =>
    (
      await client.get<PaymentList>("/payments", {
        params: { page, status: status || undefined },
      })
    ).data,
  get: async (id: string) =>
    (await client.get<Payment>(`/payments/${encodeURIComponent(id)}`)).data,
  create: async (studentId: string, key: string) =>
    (
      await client.post<Payment>(
        "/payments",
        { studentId },
        { headers: { "Idempotency-Key": key } },
      )
    ).data,
  verify: async (id: string, otp: string) =>
    (
      await client.post<Payment>(
        `/payments/${encodeURIComponent(id)}/verify-otp`,
        { otp },
      )
    ).data,
  resend: async (id: string) =>
    (
      await client.post<Payment>(
        `/payments/${encodeURIComponent(id)}/resend-otp`,
      )
    ).data,
};
