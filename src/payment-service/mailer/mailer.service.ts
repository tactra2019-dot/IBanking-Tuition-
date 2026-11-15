import nodemailer from 'nodemailer';

let transporterPromise: Promise<nodemailer.Transporter> | null = null;

export class NotificationDeliveryUnknown extends Error {}

function getTransporter() {
  if (!process.env.SMTP_HOST && process.env.MAIL_MODE !== 'mock') {
    throw new Error('Chưa cấu hình kênh gửi email');
  }
  if (!transporterPromise) {
    transporterPromise = Promise.resolve(
      process.env.SMTP_HOST
        ? nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: false,
            auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
          })
        : nodemailer.createTransport({ jsonTransport: true })
    );
  }
  return transporterPromise;
}

async function postNotification(endpoint: string, payload: Record<string, unknown>): Promise<boolean> {
  if (!process.env.NOTIFICATION_SERVICE_URL) return false;
  for (let attempt = 0; attempt < 2; attempt++) {
    // Gửi lại cùng eventId khi phản hồi bị mất.
    const res = await fetch(`${process.env.NOTIFICATION_SERVICE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Key': process.env.NOTIFICATION_INTERNAL_KEY || '' },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify(payload),
    }).catch(() => undefined);
    if (res?.ok) return true;
    if (res && res.status < 500 && ![408, 429].includes(res.status)) {
      throw new Error('Notification từ chối yêu cầu');
    }
  }
  throw new NotificationDeliveryUnknown('Chưa xác nhận gửi email từ Notification');
}

export const mailerService = {
  async sendOtp(to: string, otpCode: string, paymentRef: string, amount: number, studentCode: string, paymentId = paymentRef, expiresAt = new Date(Date.now() + 300000)) {
    if (await postNotification('/otp', { eventId: 'otp-' + paymentId, paymentId, to, otp: otpCode, expiresAt })) return;

    const transporter = await getTransporter();
    await transporter.sendMail({
      from: '"TDTU iBanking" <no-reply@ibanking.tdtu.edu.vn>',
      to,
      subject: `[iBanking] Mã OTP xác nhận thanh toán học phí (${paymentRef})`,
      text: `Mã OTP của bạn là: ${otpCode}. Giao dịch: ${paymentRef}, MSSV: ${studentCode}, Số tiền: ${amount.toLocaleString()} VNĐ. Hiệu lực: 5 phút.`,
    });

  },

  async sendReceipt(to: string, paymentRef: string, amount: number, studentCode: string, studentName: string, paymentId = paymentRef, paidAt = new Date()) {
    if (await postNotification('/payment-success', { eventId: 'receipt-' + paymentId, paymentId, to, amount, studentId: studentCode, studentName, paidAt, status: 'SUCCESS' })) return;

    const transporter = await getTransporter();
    await transporter.sendMail({
      from: '"TDTU iBanking" <no-reply@ibanking.tdtu.edu.vn>',
      to,
      subject: `[iBanking] Biên lai thanh toán học phí thành công (${paymentRef})`,
      text: `Thanh toán thành công học phí cho SV ${studentName} (${studentCode}). Mã GD: ${paymentRef}. Số tiền: ${amount.toLocaleString()} VNĐ.`,
    });
  },
};
