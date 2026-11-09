import { mailerService } from '../mailer/mailer.service';
import { prisma } from '../../shared/prisma';
import { accountClient } from './account-client.service';

// Trạng thái PROCESSING và REFUND_PENDING được commit trước thao tác HTTP tương ứng.
export async function recoverPayment(paymentId: string, afterDebit?: () => void) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (!['PROCESSING', 'REFUND_PENDING'].includes(payment.status)) return payment;
    if (payment.status === 'REFUND_PENDING') {
      const refund = await accountClient.refundBalance(payment.accountId, Number(payment.amount), payment.id);
      if (!refund.ok) return payment;
      return tx.payment.update({ where: { id: paymentId }, data: { status: 'FAILED' } });
    }

    const debit = await accountClient.deductBalance(payment.accountId, Number(payment.amount), payment.id);
    if (!debit.ok) {
      // Chỉ 402 xác nhận chắc chắn Account không trừ tiền. Lỗi vận chuyển phải được thử lại.
      if (debit.status !== 402) return payment;
      return tx.payment.update({ where: { id: paymentId }, data: {
        status: 'FAILED', failureReason: 'Số dư khả dụng không đủ',
      } });
    }
    try {
      afterDebit?.();
    } catch {
      return tx.payment.update({ where: { id: paymentId }, data: {
        status: 'REFUND_PENDING', failureReason: 'Lỗi sau debit, đang chờ hoàn tiền',
      } });
    }
    await tx.$queryRaw`SELECT id FROM tuition_fees WHERE id = ${payment.tuitionFeeId}::uuid FOR UPDATE`;
    const tuition = await tx.tuitionFee.findUniqueOrThrow({ where: { id: payment.tuitionFeeId } });
    if (tuition.status === 'PAID') {
      return tx.payment.update({ where: { id: paymentId }, data: {
        status: 'REFUND_PENDING', failureReason: 'Học phí đã được thanh toán, đang chờ hoàn tiền',
      } });
    }
    await tx.tuitionFee.update({ where: { id: tuition.id }, data: { status: 'PAID' } });
    return tx.payment.update({ where: { id: paymentId }, data: { status: 'COMPLETED' } });
  }, { timeout: 15000 });
}

export async function recoverPendingPayments() {
  const pending = await prisma.payment.findMany({
    where: { status: { in: ['PROCESSING', 'REFUND_PENDING'] } },
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


export async function deliverReceipts() {
  const payments = await prisma.payment.findMany({
    where: { status: 'COMPLETED', receiptSent: false }, select: { id: true }, take: 100,
  });
  for (const { id } of payments) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${id}::uuid FOR UPDATE`;
      const payment = await tx.payment.findUniqueOrThrow({ where: { id }, include: { student: true } });
      if (payment.receiptSent || payment.status !== 'COMPLETED') return;
      await mailerService.sendReceipt(payment.payerEmail, payment.transactionReference,
        Number(payment.amount), payment.student.studentCode, payment.student.fullName, payment.id, payment.updatedAt);
      await tx.payment.update({ where: { id }, data: { receiptSent: true } });
    }, { timeout: 15000 });
  }
}
