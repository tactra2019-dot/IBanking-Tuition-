package vn.tdtu.notification;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.mail.MailException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler({MethodArgumentNotValidException.class,HttpMessageNotReadableException.class})
    ResponseEntity<Map<String,String>> invalid(Exception ignored) { return ResponseEntity.badRequest().body(Map.of("code","INVALID_REQUEST","message","Dữ liệu không hợp lệ. Kiểm tra API contract.")); }
    @ExceptionHandler(MailException.class)
    ResponseEntity<Map<String,String>> mail(MailException ignored) { return ResponseEntity.status(503).body(Map.of("code","MAIL_UNAVAILABLE","message","Không thể gửi email. Có thể thử lại cùng eventId.")); }
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<Map<String,String>> status(ResponseStatusException error) { return ResponseEntity.status(error.getStatusCode()).body(Map.of("code","NOTIFICATION_REJECTED","message",error.getReason()==null?"Request rejected.":error.getReason())); }
    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String,String>> unexpected(Exception ignored) { return ResponseEntity.internalServerError().body(Map.of("code","INTERNAL_ERROR","message","Không thể xử lý thông báo.")); }
}
