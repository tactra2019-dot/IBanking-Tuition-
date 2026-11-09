import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, ShieldCheck, Timer, RefreshCw, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { usePayment } from "../hooks/queries";
import { paymentApi } from "../services/paymentApi";
import { errorMessage, isDemo } from "../services/client";
import { secondsRemaining } from "../utils/format";
import {
  Button,
  InfoCard,
  ErrorState,
  LoadingSkeleton,
} from "../components/ui";
import { OTPInput } from "../components/ui/OTPInput";
import { Steps, PaymentDetails } from "../components/payment/PaymentComponents";
export function OtpPage() {
  const { paymentId = "" } = useParams();
  const payment = usePayment(paymentId);
  const [otp, setOtp] = useState("");
  const [now, setNow] = useState(Date.now());
  const navigate = useNavigate();
  const query = useQueryClient();
  const locked = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (payment.data && payment.data.status !== "PENDING")
      navigate(`/payment/${paymentId}/result`, { replace: true });
  }, [payment.data, paymentId, navigate]);
  const verify = useMutation({
    mutationFn: () => paymentApi.verify(paymentId, otp),
    onSuccess: (p) => {
      query.setQueryData(["payment", paymentId], p);
      query.invalidateQueries({ queryKey: ["account"] });
      query.invalidateQueries({ queryKey: ["payments"] });
      setOtp("");
      navigate(`/payment/${paymentId}/result`, { replace: true });
    },
  });
  const resend = useMutation({
    mutationFn: () => paymentApi.resend(paymentId),
    onSuccess: (p) => {
      query.setQueryData(["payment", paymentId], p);
      setOtp("");
      verify.reset();
      toast.success(
        isDemo
          ? "Đã làm mới OTP mô phỏng. Không có email được gửi."
          : "Yêu cầu gửi lại OTP đã được tiếp nhận.",
      );
    },
  });
  const remaining = secondsRemaining(payment.data?.expiresAt, now);
  const cooldown = secondsRemaining(payment.data?.resendAvailableAt, now);
  const busy = verify.isPending || resend.isPending;
  if (payment.isPending) return <LoadingSkeleton />;
  if (payment.isError)
    return (
      <ErrorState
        message={errorMessage(payment.error)}
        retry={() => void payment.refetch()}
      />
    );
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">XÁC THỰC GIAO DỊCH</p>
          <h1>Thêm một bước để an tâm.</h1>
          <p>Xác nhận thanh toán bằng mã OTP của giao dịch này.</p>
        </div>
      </div>
      <Steps current={2} />
      <div className="otp-grid">
        <InfoCard title="Thông tin giao dịch" icon={<GraduationIcon />}>
          <PaymentDetails payment={payment.data} />
          <div className="notice">
            <ShieldCheck size={20} />
            Kiểm tra kỹ thông tin trước khi xác nhận OTP.
          </div>
          <Link to="/transactions" className="back-link">
            <ArrowLeft size={16} /> Về lịch sử giao dịch
          </Link>
        </InfoCard>
        <InfoCard className="otp-card">
          <span className="otp-icon">
            <Mail size={33} />
          </span>
          <h2>Xác thực OTP</h2>
          <p className="muted">
            {isDemo
              ? "Email nhận OTP mô phỏng:"
              : "Nhập mã OTP được gửi đến email:"}
            <br />
            <strong>{payment.data.email || "Email người thanh toán"}</strong>
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (locked.current || !/^\d{6}$/.test(otp) || remaining <= 0)
                return;
              locked.current = true;
              try {
                await verify.mutateAsync();
              } catch {
                /* Show server error. */
              } finally {
                locked.current = false;
              }
            }}
          >
            <OTPInput
              value={otp}
              onChange={(value) => {
                setOtp(value);
                verify.reset();
              }}
              disabled={busy || remaining <= 0}
            />
            <div
              className={`otp-timer ${remaining === 0 ? "expired" : ""}`}
              role="timer"
            >
              <Timer size={17} />
              {remaining > 0 ? (
                <>
                  Mã có hiệu lực trong{" "}
                  <strong>
                    {Math.floor(remaining / 60)
                      .toString()
                      .padStart(2, "0")}
                    :{(remaining % 60).toString().padStart(2, "0")}
                  </strong>
                </>
              ) : (
                "OTP đã hết hạn. Vui lòng gửi lại mã."
              )}
            </div>
            {verify.isError && (
              <ErrorState message={errorMessage(verify.error)} />
            )}
            <Button
              className="full-width"
              type="submit"
              disabled={
                !/^\d{6}$/.test(otp) || remaining <= 0 || resend.isPending
              }
              busy={verify.isPending}
            >
              <ShieldCheck size={19} />
              Xác nhận OTP
            </Button>
          </form>
          <p className="caption">Chưa nhận được mã?</p>
          <Button
            variant="ghost"
            busy={resend.isPending}
            disabled={busy || !payment.data.canResend || cooldown > 0}
            onClick={async () => {
              if (locked.current) return;
              locked.current = true;
              try {
                await resend.mutateAsync();
              } catch {
                /* Show error. */
              } finally {
                locked.current = false;
              }
            }}
          >
            <RefreshCw size={16} />
            Gửi lại mã {cooldown > 0 ? `(${cooldown}s)` : ""}
          </Button>
          {!payment.data.canResend && (
            <p className="caption">Không thể gửi lại mã cho giao dịch này.</p>
          )}
          {resend.isError && (
            <ErrorState message={errorMessage(resend.error)} />
          )}{" "}
          {isDemo && (
            <div className="demo-hint">
              OTP demo: <b>123456</b> · Không có email thật được gửi.
              <br />
              Mã được kiểm tra tại mock server.
            </div>
          )}
        </InfoCard>
      </div>
    </div>
  );
}
function GraduationIcon() {
  return <ShieldCheck size={21} />;
}
