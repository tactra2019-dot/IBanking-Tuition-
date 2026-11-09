package vn.tdtu.notification;

import java.text.NumberFormat;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import org.springframework.web.util.HtmlUtils;

public final class EmailTemplates {
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss").withZone(ZoneId.of("Asia/Ho_Chi_Minh"));
    private EmailTemplates() {}
    private static String escape(String value) { return HtmlUtils.htmlEscape(value); }
    private static String frame(String title, String content) {
        return "<!doctype html><html lang=\"vi\"><head><meta charset=\"UTF-8\"></head><body style=\"margin:0;background:#F4F9FF;font-family:Arial,sans-serif;color:#102C5A\"><table role=\"presentation\" style=\"max-width:600px;width:100%;margin:30px auto;background:white;border-radius:16px\"><tr><td style=\"padding:32px\"><p style=\"color:#0754C9;font-size:20px;font-weight:bold\">iBanking Học Phí · TDTU</p><h1 style=\"font-size:24px\">" + title + "</h1>" + content + "<hr style=\"border:0;border-top:1px solid #E1EBF5;margin:28px 0\"><p style=\"color:#64748B;font-size:12px\">Đây là email tự động từ hệ thống thanh toán học phí. Không chia sẻ mã OTP với bất kỳ ai. Nếu bạn không thực hiện giao dịch, vui lòng liên hệ đơn vị quản lý tài khoản.</p></td></tr></table></body></html>";
    }
    public static String otp(NotificationRequests.Otp r) {
        return frame("Xác thực giao dịch thanh toán học phí", "<p>Mã giao dịch: <strong>" + escape(r.paymentId()) + "</strong></p><p>Mã OTP của bạn:</p><p style=\"padding:20px;text-align:center;font-size:32px;letter-spacing:10px;font-weight:bold;color:#0754C9;background:#EDF8FF;border-radius:10px\">" + escape(r.otp()) + "</p><p>Hết hạn lúc <strong>" + TIME.format(r.expiresAt()) + " (giờ Việt Nam)</strong>. Mã chỉ dùng để xác thực giao dịch nêu trên.</p><p>Email này chưa phải xác nhận thanh toán thành công.</p>");
    }
    public static String success(NotificationRequests.PaymentSuccess r) {
        String amount = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("vi-VN")).format(r.amount());
        return frame("Thanh toán học phí thành công", "<p style=\"color:#16A34A\">Giao dịch đã được Payment Service xác nhận thành công.</p><p>Mã giao dịch: <strong>" + escape(r.paymentId()) + "</strong></p><p>MSSV: " + escape(r.studentId()) + "</p><p>Sinh viên: " + escape(r.studentName()) + "</p><p>Số tiền: <strong>" + amount + "</strong></p><p>Thời gian: " + TIME.format(r.paidAt()) + " (giờ Việt Nam)</p><p>Trạng thái: <strong>Thành công</strong></p>");
    }
}
