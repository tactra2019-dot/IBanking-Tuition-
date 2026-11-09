import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, History, Plus } from "lucide-react";
import { usePayments } from "../hooks/queries";
import type { Status } from "../types";
import {
  InfoCard,
  ErrorState,
  LoadingSkeleton,
  Button,
} from "../components/ui";
import { TransactionTable } from "../components/payment/PaymentComponents";
import { errorMessage } from "../services/client";
export function TransactionHistoryPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<Status | "">("");
  const payments = usePayments(page, status);
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">LỊCH SỬ GIAO DỊCH</p>
          <h1>Mọi khoản thanh toán, thật rõ ràng.</h1>
          <p>Tra cứu kết quả và theo dõi các giao dịch học phí của bạn.</p>
        </div>
        <Link to="/payment" className="button primary">
          <Plus size={18} />
          Thanh toán mới
        </Link>
      </div>
      <InfoCard className="history-card">
        <div className="history-heading">
          <h2 className="card-title">
            <History size={23} />
            Danh sách giao dịch
          </h2>
          <div className="filter">
            <label htmlFor="status">Trạng thái</label>
            <select
              id="status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as Status | "");
                setPage(1);
              }}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="SUCCESS">Thành công</option>
              <option value="PENDING">Chờ xác thực</option>
              <option value="PROCESSING">Đang xử lý</option>
              <option value="FAILED">Thất bại</option>
            </select>
          </div>
        </div>
        {payments.isPending ? (
          <LoadingSkeleton />
        ) : payments.isError ? (
          <ErrorState
            message={errorMessage(payments.error)}
            retry={() => void payments.refetch()}
          />
        ) : (
          <>
            <TransactionTable items={payments.data.items} />
            <div className="pagination">
              <span>
                {payments.data.total} giao dịch · Trang {page}/
                {Math.max(
                  1,
                  Math.ceil(payments.data.total / payments.data.pageSize),
                )}
              </span>
              <div>
                <Button
                  variant="secondary"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                  aria-label="Trang trước"
                >
                  <ArrowLeft size={17} />
                </Button>
                <Button
                  variant="secondary"
                  disabled={
                    page * payments.data.pageSize >= payments.data.total
                  }
                  onClick={() => setPage(page + 1)}
                  aria-label="Trang sau"
                >
                  <ArrowRight size={17} />
                </Button>
              </div>
            </div>
          </>
        )}
      </InfoCard>
      <div className="notice">
        Giao dịch “Chờ xác thực” hoặc “Đang xử lý” chưa phải thanh toán thành
        công. Mở chi tiết để theo dõi trạng thái.
      </div>
    </div>
  );
}
