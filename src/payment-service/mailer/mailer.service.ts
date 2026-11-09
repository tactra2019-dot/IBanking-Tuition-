import nodemailer from 'nodemailer';

let transporterPromise: Promise<nodemailer.Transporter> | null = null;

function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = Promise.resolve(
      process.env.SMTP_HOST && process.env.SMTP_USER
        ? nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: false,
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
          })
        : nodemailer.createTransport({ jsonTransport: true })
    );
  }
  return transporterPromise;
}

async function postNotification(endpoint: string, payload: Record<string, unknown>): Promise<boolean> {
  if (!process.env.NOTIFICATION_SERVICE_URL) return false;
  try {
    const res = await fetch(`${process.env.NOTIFICATION_SERVICE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Key': process.env.NOTIFICATION_INTERNAL_KEY || '' },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify(payload),
    });
    if (res.ok) return true;
    throw new Error('Notification từ chối yêu cầu');
  } catch {
    throw new Error('Chưa xác nhận gửi email từ Notification');
  }
  return false;
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
    console.log(`[RECEIPT] Sent to ${to} | Ref: ${paymentRef} | Amount: ${amount}`);
  },
};


