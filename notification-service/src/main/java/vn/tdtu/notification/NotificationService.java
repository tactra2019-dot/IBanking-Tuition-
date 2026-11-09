package vn.tdtu.notification;

import jakarta.mail.MessagingException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class NotificationService {
    private final JavaMailSender sender;
    private final String from;
    private final Clock clock;
    private record Sent(String fingerprint, Instant expiresAt) {}
    private final Map<String, Sent> sent = new HashMap<>();
    public NotificationService(JavaMailSender sender, @Value("${notification.from}") String from, Clock clock) { this.sender=sender; this.from=from; this.clock=clock; }
    public String otp(NotificationRequests.Otp request) {
        Instant now = clock.instant();
        if (!request.expiresAt().isAfter(now) || request.expiresAt().isAfter(now.plusSeconds(300))) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OTP expiration must be within five minutes.");
        return deliver(request.eventId(), request.to(), "Mã OTP xác thực thanh toán học phí", EmailTemplates.otp(request));
    }
    public String success(NotificationRequests.PaymentSuccess request) {
        if (!"SUCCESS".equals(request.status())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Confirmed SUCCESS required.");
        return deliver(request.eventId(), request.to(), "Xác nhận thanh toán học phí thành công", EmailTemplates.success(request));
    }
    private synchronized String deliver(String eventId, String to, String subject, String html) {
        Instant now=clock.instant();
        sent.entrySet().removeIf(e -> !e.getValue().expiresAt().isAfter(now));
        String fingerprint = digest(to + "\n" + subject + "\n" + html);
        Sent previous=sent.get(eventId);
        if (previous!=null) {
            if (!previous.fingerprint().equals(fingerprint)) throw new ResponseStatusException(HttpStatus.CONFLICT, "Event ID already used with different payload.");
            return "DUPLICATE";
        }
        if (sent.size()>=10000) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Notification capacity reached.");
        try {
            var message=sender.createMimeMessage();
            var helper=new MimeMessageHelper(message, false, StandardCharsets.UTF_8.name());
            helper.setFrom(from); helper.setTo(to); helper.setSubject(subject); helper.setText(html,true);
            sender.send(message);
            sent.put(eventId,new Sent(fingerprint,now.plusSeconds(86400)));
            return "SENT";
        } catch (MessagingException e) { throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Email delivery unavailable."); }
    }
    private static String digest(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException("SHA-256 unavailable"); }
    }
}
