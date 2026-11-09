package vn.tdtu.notification;

import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/internal/notifications")
public class NotificationController {
    private final NotificationService service;
    public NotificationController(NotificationService service) { this.service=service; }
    @PostMapping("/otp") public Map<String,String> otp(@Valid @RequestBody NotificationRequests.Otp request) {
        return Map.of("eventId",request.eventId(),"deliveryStatus",service.otp(request));
    }
    @PostMapping("/payment-success") public Map<String,String> success(@Valid @RequestBody NotificationRequests.PaymentSuccess request) {
        return Map.of("eventId",request.eventId(),"deliveryStatus",service.success(request));
    }
}
