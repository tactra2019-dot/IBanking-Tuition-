package vn.tdtu.notification;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(1)
public class InternalAuthFilter extends OncePerRequestFilter {
    private final byte[] key;
    public InternalAuthFilter(@Value("${notification.internal-key}") String key) {
        if (key == null || key.isBlank() || key.length() < 32) throw new IllegalStateException("NOTIFICATION_INTERNAL_KEY must contain at least 32 characters.");
        this.key = key.getBytes(StandardCharsets.UTF_8);
    }
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        String supplied = request.getHeader("X-Internal-Key");
        response.setHeader("Cache-Control", "no-store");
        if (supplied == null || !MessageDigest.isEqual(key, supplied.getBytes(StandardCharsets.UTF_8))) {
            response.setStatus(401); response.setContentType("application/json");
            response.getWriter().write("{\"code\":\"UNAUTHORIZED\",\"message\":\"Internal service authentication required.\"}"); return;
        }
        if (request.getContentLengthLong() > 16384) { response.setStatus(413); return; }
        chain.doFilter(request, response);
    }
}
