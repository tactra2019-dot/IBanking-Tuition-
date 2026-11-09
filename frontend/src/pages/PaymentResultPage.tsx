import { Link, useParams } from "react-router-dom";
import { Check, Clock3, X, ArrowRight, History } from "lucide-react";
import { usePayment } from "../hooks/queries";
import { errorMessage, isDemo } from "../services/client";
import {
  InfoCard,
  ErrorState,
  LoadingSkeleton,
  StatusBadge,
  Button,
} from "../components/ui";
import { Steps, PaymentDetails } from "../components/payment/PaymentComponents";
export function PaymentResultPage() {
  const { paymentId = "" } = useParams();
  const payment = usePayment(paymentId);
  if (payment.isPending) return <LoadingSkeleton />;
  if (payment.isError)
    return (
      <ErrorState
        message={errorMessage(payment.error)}
        retry={() => void payment.refetch()}
      />
    );
  const p = payment.data;
  const success = p.status === "SUCCESS";
  const failed = p.status === "FAILED";
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">KẾT QUẢ GIAO DỊCH</p>
          <h1>Thông tin thanh toán của bạn.</h1>
        </div>
      </div>
      <Steps current={3} />
      <InfoCard className="result-card">
        <div
          className={`result-icon ${success ? "success" : failed ? "failed" : "pending"}`}
        >
          {success ? (
            <Check size={47} />
          ) : failed ? (
            <X size={47} />
          ) : (
            <Clock3 size={47} />
          )}
        </div>
        <StatusBadge status={p.status} />
        <h2>
          {success
            ? "Thanh toán học phí thành công"
            : failed
              ? "Giao dịch chưa thành công"
              : p.status === "PENDING"
                ? "Giao dịch đang chờ xác thực"
                : "Giao dịch đang được xử lý"}
        </h2>
        <p className="muted">
          {success
            ? "Máy chủ đã xác nhận và ghi nhận thanh toán học phí."
            : failed
              ? p.failureReason ||
                "Vui lòng kiểm tra thông tin và liên hệ đơn vị quản lý nếu cần."
              : "Chưa có xác nhận thanh toán thành công. Trạng thái được cập nhật tự động mỗi 5 giây."}
        </p>
        {isDemo && (
          <p className="demo-hint">
            Kết quả mô phỏng · Không phải xác nhận giao dịch tài chính thật.
          </p>
        )}
        <PaymentDetails payment={p} />
        <div className="result-actions">
          {p.status === "PENDING" && (
            <Link className="button primary" to={`/payment/${p.id}/otp`}>
              Tiếp tục xác thực OTP
            </Link>
          )}
          {p.status === "PROCESSING" && (
            <Button
              variant="secondary"
              onClick={() => void payment.refetch()}
              busy={payment.isFetching}
            >
              Cập nhật trạng thái
            </Button>
          )}
          <Link className="button primary" to="/transactions">
            <History size={18} />
            Xem lịch sử
          </Link>
          <Link className="button secondary" to="/dashboard">
            Về trang chủ <ArrowRight size={17} />
          </Link>
        </div>
        <p className="caption">
          Mã giao dịch giúp bạn tra cứu và đối chiếu khi cần hỗ trợ.
        </p>
      </InfoCard>
    </div>
  );
}
