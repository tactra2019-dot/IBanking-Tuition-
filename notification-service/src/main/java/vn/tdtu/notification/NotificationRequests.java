package vn.tdtu.notification;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.Instant;

public final class NotificationRequests {
    private NotificationRequests() {}
    public record Otp(
        @NotBlank @Pattern(regexp="[A-Za-z0-9_-]{1,80}") String eventId,
        @NotBlank @Pattern(regexp="[A-Za-z0-9_-]{1,80}") String paymentId,
        @NotBlank @Email @Size(max=254) String to,
        @NotBlank @Pattern(regexp="\\d{6}") String otp,
        @NotNull Instant expiresAt
    ) { @Override public String toString() { return "Otp[REDACTED]"; } }
    public record PaymentSuccess(
        @NotBlank @Pattern(regexp="[A-Za-z0-9_-]{1,80}") String eventId,
        @NotBlank @Pattern(regexp="[A-Za-z0-9_-]{1,80}") String paymentId,
        @NotBlank @Email @Size(max=254) String to,
        @NotBlank @Pattern(regexp="[A-Za-z0-9]{6,15}") String studentId,
        @NotBlank @Size(max=120) String studentName,
        @NotNull @DecimalMin("1") @Digits(integer=12,fraction=0) BigDecimal amount,
        @NotNull @PastOrPresent Instant paidAt,
        @NotBlank @Pattern(regexp="SUCCESS") String status
    ) { @Override public String toString() { return "PaymentSuccess[REDACTED]"; } }
}
