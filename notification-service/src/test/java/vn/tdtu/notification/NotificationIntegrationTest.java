package vn.tdtu.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = "notification.internal-key=local-test-only-key-not-a-secret-123456")
@AutoConfigureMockMvc
class NotificationIntegrationTest {
    private static final String TEST_KEY="local-test-only-key-not-a-secret-123456";
    private static final SmtpStub SMTP = new SmtpStub();
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @DynamicPropertySource static void mailProperties(DynamicPropertyRegistry r) {
        r.add("spring.mail.host",()->"127.0.0.1"); r.add("spring.mail.port",SMTP::port);
        r.add("spring.mail.properties.mail.smtp.auth",()->"false");
        r.add("spring.mail.properties.mail.smtp.starttls.enable",()->"false");
        r.add("spring.mail.properties.mail.smtp.starttls.required",()->"false");
    }
    @BeforeEach void reset() { SMTP.messages.clear(); SMTP.reject.set(false); }
    @AfterAll static void close() throws IOException { SMTP.close(); }
    Map<String,Object> otp() { return new HashMap<>(Map.of("eventId",UUID.randomUUID().toString(),"paymentId","PAY-123","to","payer@example.com","otp","123456","expiresAt",Instant.now().plusSeconds(240).toString())); }
    Map<String,Object> success() { return new HashMap<>(Map.of("eventId",UUID.randomUUID().toString(),"paymentId","PAY-123","to","payer@example.com","studentId","52200001","studentName","Nguyễn Minh Anh","amount",7500000,"paidAt",Instant.now().minusSeconds(10).toString(),"status","SUCCESS")); }
    org.springframework.test.web.servlet.ResultActions send(String path,Map<String,Object> body) throws Exception { return mvc.perform(post("/internal/notifications/"+path).header("X-Internal-Key",TEST_KEY).contentType("application/json").content(mapper.writeValueAsBytes(body))); }
    @Test void unauthorizedCallerCannotSend() throws Exception {
        mvc.perform(post("/internal/notifications/otp").contentType("application/json").content(mapper.writeValueAsBytes(otp()))).andExpect(status().isUnauthorized());
        mvc.perform(post("/internal/notifications/otp").header("X-Internal-Key","wrong").contentType("application/json").content(mapper.writeValueAsBytes(otp()))).andExpect(status().isUnauthorized());
        assertThat(SMTP.messages).isEmpty();
    }
    @Test void sendsVietnameseOtpThroughRealSmtpProtocol() throws Exception {
        send("otp",otp()).andExpect(status().isOk()).andExpect(jsonPath("$.deliveryStatus").value("SENT"));
        MimeMessage email=SMTP.next();
        assertThat(email.getSubject()).isEqualTo("Mã OTP xác thực thanh toán học phí");
        assertThat(email.getContent().toString()).contains("123456","PAY-123","Hết hạn lúc","giờ Việt Nam","chưa phải xác nhận thanh toán thành công");
        assertThat(email.getAllRecipients()[0].toString()).isEqualTo("payer@example.com");
    }
    @Test void sendsConfirmedSuccessWithEscapedStudentName() throws Exception {
        var body=success();body.put("studentName","<script>alert(1)</script>");
        send("payment-success",body).andExpect(status().isOk());
        MimeMessage email=SMTP.next();
        assertThat(email.getSubject()).contains("thành công");
        assertThat(email.getContent().toString()).contains("7.500.000","52200001","&lt;script&gt;").doesNotContain("<script>");
    }
    @Test void pendingProcessingAndFailedNeverSendSuccessEmail() throws Exception {
        for(String status:List.of("PENDING","PROCESSING","FAILED")) {var body=success();body.put("status",status);send("payment-success",body).andExpect(status().isBadRequest());}
        assertThat(SMTP.messages).isEmpty();
    }
    @Test void expiredAndOverFiveMinuteOtpAreRejected() throws Exception {
        var body=otp();body.put("expiresAt",Instant.now().minusSeconds(1).toString());send("otp",body).andExpect(status().isBadRequest());
        body.put("expiresAt",Instant.now().plusSeconds(360).toString());send("otp",body).andExpect(status().isBadRequest());
        assertThat(SMTP.messages).isEmpty();
    }
    @Test void invalidInputDoesNotEchoOtpInError() throws Exception {
        var body=otp();body.put("otp","sensitive-invalid-fixture");
        var response=send("otp",body).andExpect(status().isBadRequest()).andReturn().getResponse().getContentAsString();
        assertThat(response).doesNotContain("sensitive-invalid-fixture");
        assertThat(SMTP.messages).isEmpty();
    }
    @Test void duplicateEventSendsOnceAndConflictingPayloadIsRejected() throws Exception {
        var body=otp();send("otp",body).andExpect(status().isOk());send("otp",body).andExpect(jsonPath("$.deliveryStatus").value("DUPLICATE"));
        assertThat(SMTP.messages).hasSize(1);body.put("to","different@example.com");send("otp",body).andExpect(status().isConflict());assertThat(SMTP.messages).hasSize(1);
    }
    @Test void smtpFailureReturns503AndRetryCanSucceed() throws Exception {
        SMTP.reject.set(true);var body=otp();send("otp",body).andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("MAIL_UNAVAILABLE"));
        assertThat(SMTP.messages).isEmpty();SMTP.reject.set(false);send("otp",body).andExpect(status().isOk());assertThat(SMTP.messages).hasSize(1);
    }
    @Test void invalidEmailAmountAndFuturePaymentAreRejected() throws Exception {
        var body=success();body.put("to","not-an-email");send("payment-success",body).andExpect(status().isBadRequest());
        body=success();body.put("amount",-1);send("payment-success",body).andExpect(status().isBadRequest());
        body=success();body.put("paidAt",Instant.now().plusSeconds(3600).toString());send("payment-success",body).andExpect(status().isBadRequest());
        assertThat(SMTP.messages).isEmpty();
    }
    @Test void blankInternalKeyFailsClosed() { org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class,()->new InternalAuthFilter("")); }

    /** Local SMTP capture server. Never forwards mail, logs bodies or writes OTP to disk. */
    static final class SmtpStub implements AutoCloseable {
        final ServerSocket server;
        final BlockingQueue<String> messages=new LinkedBlockingQueue<>();
        final AtomicBoolean reject=new AtomicBoolean(false);
        final ExecutorService worker=Executors.newSingleThreadExecutor(r->{var t=new Thread(r,"test-smtp");t.setDaemon(true);return t;});
        SmtpStub() { try { server=new ServerSocket(0,50,InetAddress.getLoopbackAddress()); } catch(IOException e){throw new UncheckedIOException(e);} worker.submit(()->{while(!server.isClosed()){try(var socket=server.accept()){handle(socket);}catch(IOException ignored){/* Closing server or client. */}}}); }
        int port(){return server.getLocalPort();}
        MimeMessage next() throws Exception { String raw=messages.poll(3,TimeUnit.SECONDS);assertThat(raw).isNotNull();return new MimeMessage(Session.getInstance(new Properties()),new ByteArrayInputStream(raw.getBytes(StandardCharsets.UTF_8))); }
        void handle(Socket socket) throws IOException {
            socket.setSoTimeout(5000);var input=new BufferedReader(new InputStreamReader(socket.getInputStream(),StandardCharsets.UTF_8));var output=new PrintWriter(new OutputStreamWriter(socket.getOutputStream(),StandardCharsets.UTF_8),true);
            output.print("220 localhost test SMTP\r\n");output.flush();String line;
            while((line=input.readLine())!=null){String upper=line.toUpperCase(Locale.ROOT);
                if(upper.startsWith("EHLO")||upper.startsWith("HELO")){output.print("250 localhost\r\n");}
                else if(upper.startsWith("MAIL FROM")&&reject.get()){output.print("451 Delivery temporarily unavailable\r\n");}
                else if(upper.equals("DATA")){output.print("354 End data with dot\r\n");output.flush();var body=new StringBuilder();while((line=input.readLine())!=null&&!line.equals(".")){body.append(line.startsWith("..")?line.substring(1):line).append("\r\n");}messages.add(body.toString());output.print("250 Accepted\r\n");}
                else if(upper.equals("QUIT")){output.print("221 Bye\r\n");output.flush();return;}
                else{output.print("250 OK\r\n");}output.flush();
            }
        }
        @Override public void close() throws IOException {server.close();worker.shutdownNow();}
    }
}
