import { studentRequest, TuitionSnapshot } from './student-client';
import { mailerService } from '../mailer/mailer.service';
import { prisma } from '../../shared/prisma';
import { accountClient } from './account-client.service';

const MAX_RECOVERY_ATTEMPTS = 30;

// Trạng thái PROCESSING và REFUND_PENDING được commit trước thao tác HTTP tương ứng.
export async function recoverPayment(paymentId: string, afterDebit?: () => void) {
  async function advance() {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      if (!['PROCESSING', 'REFUND_PENDING'].includes(payment.status)) return payment;
      const amount = Number(payment.amount);
      const release = () => studentRequest(payment.tuitionFeeId, 'release', payment.id, amount);
      const retry = (stage: string, status?: number) => {
        const attempts = payment.recoveryAttempts + 1;
        const needsReview = attempts >= MAX_RECOVERY_ATTEMPTS;
        return tx.payment.update({ where: { id: paymentId }, data: {
          recoveryAttempts: attempts,
          nextRetryAt: needsReview ? null : new Date(Date.now() + Math.min(10000 * attempts, 60000)),
          ...(needsReview ? {
            status: 'REVIEW_REQUIRED',
            failureReason: `Cần đối soát ${payment.status}/${stage} (HTTP ${status ?? 'không rõ'})`,
          } : {}),
        } });
      };
      if (payment.status === 'REFUND_PENDING') {
        const refund = await accountClient.refundBalance(payment.accountId, Number(payment.amount), payment.id);
        if (!refund.ok) return retry('refund', refund.status);
        const released = await release();
        if (!released.ok) return retry('release', released.status);
        return tx.payment.update({ where: { id: paymentId }, data: { status: 'FAILED', failureReason: 'Đã hoàn tiền', nextRetryAt: null } });
      }

      if (!payment.debitStarted) {
        const reservation = await studentRequest(payment.tuitionFeeId, 'reserve', payment.id, amount);
        if (reservation.status === 409) return tx.payment.update({
          where: { id: paymentId }, data: { status: 'FAILED', failureReason: 'Học phí đã thanh toán hoặc đang được xử lý' },
        });
        if (!reservation.ok) return retry('reserve', reservation.status);
        await tx.payment.update({ where: { id: paymentId }, data: { debitStarted: true } });
        return null;
      }
      const debit = await accountClient.deductBalance(payment.accountId, Number(payment.amount), payment.id);
      if (!debit.ok) {
        // Chỉ 402 xác nhận chắc chắn Account không trừ tiền. Lỗi vận chuyển phải được thử lại.
        if (debit.status !== 402) return retry('debit', debit.status);
        const released = await release();
        if (!released.ok) return retry('release', released.status);
        return tx.payment.update({ where: { id: paymentId }, data: {
          status: 'FAILED', failureReason: 'Số dư khả dụng không đủ',
        } });
      }
      try {
        afterDebit?.();
      } catch {
        return tx.payment.update({ where: { id: paymentId }, data: {
          status: 'REFUND_PENDING', recoveryAttempts: 0, nextRetryAt: null, failureReason: 'Lỗi sau debit, đang chờ hoàn tiền',
        } });
      }
      const committed = await studentRequest(payment.tuitionFeeId, 'commit', payment.id, amount);
      if (committed.status === 409) {
        const response = await studentRequest(payment.tuitionFeeId);
        const fee: TuitionSnapshot | undefined = response.ok
          ? (await response.json().catch(() => undefined))?.data
          : undefined;
        // PAID cho một giao dịch khác xác nhận commit của ID hiện tại không thể thành công.
        if (fee?.id === payment.tuitionFeeId && fee.status === 'PAID' &&
            fee.reservedPaymentId && fee.reservedPaymentId !== payment.id) {
          return tx.payment.update({ where: { id: paymentId }, data: {
            status: 'REFUND_PENDING', recoveryAttempts: 0, nextRetryAt: null,
            failureReason: 'Khoản học phí đã được thanh toán bởi giao dịch khác',
          } });
        }
      }
      if (!committed.ok) return retry('commit', committed.status);
      return tx.payment.update({ where: { id: paymentId }, data: { status: 'COMPLETED', nextRetryAt: null } });
    }, { timeout: 15000 });
  }

  // Ghi bền vững quyền bắt đầu debit trước khi gọi Account.
  const result = await advance();
  if (result) return result;
  const resumed = await advance();
  if (!resumed) throw new Error('Không thể xác định bước debit');
  return resumed;
}

export async function recoverPendingPayments(force = false) {
  await prisma.payment.updateMany({
    where: { status: 'PENDING', createdAt: { lte: new Date(Date.now() - 300000) }, otpCodes: { none: {} } },
    data: { status: 'EXPIRED', failureReason: 'Không có mã OTP' },
  });
  const pending = await prisma.payment.findMany({
    where: { status: { in: ['PROCESSING', 'REFUND_PENDING'] }, ...(force ? {} : { OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }] }) },
    select: { id: true }, orderBy: { updatedAt: 'asc' }, take: 100,
  });
  for (const payment of pending) {
    try { await recoverPayment(payment.id); }
    catch (error) { console.error('Đối soát sẽ thử lại', payment.id); }
  }
}

export function startRecoveryWorker() {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await recoverPendingPayments(); await deliverReceipts(); }
    catch { console.error('Chưa truy cập được hàng đợi đối soát'); }
    finally { running = false; }
  }, 3000);
  timer.unref();
  return timer;
}


export async function deliverReceipts(paymentId?: string) {
  const payments = await prisma.payment.findMany({
    where: {
      status: 'COMPLETED', receiptSent: false, studentCode: { not: null },
      ...(paymentId ? { id: paymentId } : {}),
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
    },
    select: { id: true }, orderBy: { updatedAt: 'asc' }, take: 100,
  });
  for (const { id } of payments) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${id}::uuid FOR UPDATE`;
      const payment = await tx.payment.findUniqueOrThrow({ where: { id } });
      if (payment.receiptSent || payment.status !== 'COMPLETED') return;
      await mailerService.sendReceipt(payment.payerEmail, payment.transactionReference,
        Number(payment.amount), payment.studentCode!, payment.studentName!, payment.id, payment.updatedAt);
      await tx.payment.update({ where: { id }, data: { receiptSent: true } });
    }, { timeout: 15000 }).catch(async () => {
      console.error('Chưa gửi được biên nhận', id);
      // Giữ nguyên thời điểm hoàn tất đã đưa vào nội dung thư.
      await prisma.$executeRaw`UPDATE payments SET next_retry_at = now() + interval '30 seconds'
        WHERE id = ${id}::uuid AND receipt_sent = false`.catch(() => undefined);
    });
  }
}
