import { client, isDemo } from "./client";
import type { Payment, PaymentList, Status, Student } from "../types";
function mapPayment(p: any): Payment {
  return {
    id: p.id ?? p.paymentId, studentId: p.studentCode, studentName: p.studentName,
    amount: p.amount, status: p.status === "COMPLETED" ? "SUCCESS"
      : p.status === "EXPIRED" ? "FAILED" : p.status,
    createdAt: p.createdAt, description: p.semester ?? "Thanh toán học phí",
    expiresAt: p.expiresAt, canResend: false, email: p.payerEmail, failureReason: p.failureReason,
  };
}
export const paymentApi = {
  list: async (page = 1, status: Status | "" = ""): Promise<PaymentList> => {
    if (isDemo) return (await client.get("/payments", { params: { page, status } })).data;
    const me = (await client.get("/auth/me")).data.data;
    const records = (await client.get(`/payments/account/${encodeURIComponent(me.accountId)}`)).data.data.map(mapPayment) as Payment[];
    const filtered = records.filter(p => !status || p.status === status);
    return { items: filtered.slice((page - 1) * 10, page * 10), total: filtered.length, page, pageSize: 10 };
  },
  get: async (id: string): Promise<Payment> => {
    const response = (await client.get(`/payments/${encodeURIComponent(id)}`)).data;
    return isDemo ? response : mapPayment(response.data);
  },
  create: async (student: Student, key: string): Promise<Payment> => {
    if (isDemo) return (await client.post("/payments", { studentId: student.id }, { headers: { "Idempotency-Key": key } })).data;
    const response = await client.post("/payments/create-intent", {
      studentCode: student.id, tuitionFeeId: student.tuitionFeeId, amount: student.amount,
    }, { headers: { "Idempotency-Key": key } });
    return paymentApi.get(response.data.data.paymentId);
  },
  verify: async (id: string, otp: string): Promise<Payment> => {
    if (isDemo) return (await client.post(`/payments/${encodeURIComponent(id)}/verify-otp`, { otp })).data;
    try {
      await client.post("/payments/confirm-otp", { paymentId: id, otpCode: otp });
    } catch (error) {
      const current = await paymentApi.get(id).catch(() => undefined);
      if (current && current.status !== "PENDING") return current;
      throw error;
    }
    return paymentApi.get(id);
  },
  resend: async (id: string): Promise<Payment> => {
    if (isDemo) return (await client.post(`/payments/${encodeURIComponent(id)}/resend-otp`)).data;
    throw new Error("Hãy tạo yêu cầu thanh toán mới để nhận OTP mới.");
  },
};
