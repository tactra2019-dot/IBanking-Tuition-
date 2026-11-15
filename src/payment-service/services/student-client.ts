import { internalToken } from '../../shared/internal';

export interface TuitionSnapshot {
  id: string;
  studentId: string;
  studentCode: string;
  studentName: string;
  semester: string;
  amount: number;
  status: 'PAID' | 'UNPAID';
  reservedPaymentId: string | null;
}

export async function studentRequest(id: string, action?: 'reserve' | 'commit' | 'release', paymentId?: string, amount?: number) {
  const base = process.env.STUDENT_SERVICE_ORIGIN || 'http://127.0.0.1:4001';
  return fetch(base + '/internal/tuitions/' + encodeURIComponent(id) + (action ? '/' + action : ''), {
    method: action ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Key': internalToken('STUDENT_SERVICE_TOKEN') },
    body: action ? JSON.stringify({ paymentId, amount }) : undefined,
    signal: AbortSignal.timeout(2500), redirect: 'error',
  }).catch(() => new Response(null, { status: 503 }));
}

