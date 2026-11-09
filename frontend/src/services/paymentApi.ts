import { client, isDemo } from "./client";
import type { Payment, PaymentList, Status } from "../types";
function mapPayment(p: any): Payment {
  return {
    id: p.id ?? p.paymentId, studentId: p.studentCode, studentName: p.studentName,
    amount: p.amount, status: p.status === "COMPLETED" ? "SUCCESS"
      : p.status === "REFUND_PENDING" ? "PROCESSING" : p.status === "EXPIRED" ? "FAILED" : p.status,
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
  create: async (studentId: string, key: string): Promise<Payment> => {
    if (isDemo) return (await client.post("/payments", { studentId }, { headers: { "Idempotency-Key": key } })).data;
    const tuition = (await client.get(`/tuitions/student/${encodeURIComponent(studentId)}`)).data.data;
    const response = await client.post("/payments/create-intent", { studentCode: studentId, tuitionFeeId: tuition.id });
    return paymentApi.get(response.data.data.paymentId);
  },
  verify: async (id: string, otp: string): Promise<Payment> => {
    if (isDemo) return (await client.post(`/payments/${encodeURIComponent(id)}/verify-otp`, { otp })).data;
    await client.post("/payments/confirm-otp", { paymentId: id, otpCode: otp });
    return paymentApi.get(id);
  },
  resend: async (id: string): Promise<Payment> => {
    if (isDemo) return (await client.post(`/payments/${encodeURIComponent(id)}/resend-otp`)).data;
    throw new Error("Hãy tạo yêu cầu thanh toán mới để nhận OTP mới.");
  },
};
