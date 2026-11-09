export type Status = "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED";
export interface User {
  id: string;
  fullName: string;
  email: string;
  phone: string;
}
export interface Account {
  accountNumber: string;
  balance: number;
  status: string;
  currency: string;
}
export interface Student {
  id: string;
  fullName: string;
  amount: number;
  tuitionStatus: "PAID" | "UNPAID" | "NONE";
  semester: string;
}
export interface Payment {
  id: string;
  studentId: string;
  studentName: string;
  amount: number;
  status: Status;
  createdAt: string;
  description: string;
  expiresAt?: string;
  resendAvailableAt?: string;
  canResend?: boolean;
  email?: string;
  failureReason?: string;
}
export interface PaymentList {
  items: Payment[];
  total: number;
  page: number;
  pageSize: number;
}
