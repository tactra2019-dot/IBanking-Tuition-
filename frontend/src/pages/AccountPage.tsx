import { UserRound, ShieldCheck } from "lucide-react";
import { useAuth } from "../app/AuthContext";
import { useAccount } from "../hooks/queries";
import { InfoCard, Input, LoadingSkeleton, ErrorState } from "../components/ui";
import { BalanceCard } from "../components/payment/PaymentComponents";
import { errorMessage } from "../services/client";
export function AccountPage() {
  const { user } = useAuth();
  const account = useAccount();
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">TÀI KHOẢN CỦA TÔI</p>
          <h1>Thông tin tài khoản.</h1>
          <p>
            Thông tin người thanh toán được dùng để nhận mã OTP và kết quả giao
            dịch.
          </p>
        </div>
      </div>
      <div className="payment-grid">
        <InfoCard title="Thông tin cá nhân" icon={<UserRound />}>
          <div className="page-stack">
            <Input label="Họ và tên" value={user?.fullName || ""} readOnly />
            <Input
              label="Email nhận thông báo"
              value={user?.email || ""}
              readOnly
            />
            <Input label="Số điện thoại" value={user?.phone || ""} readOnly />
          </div>
        </InfoCard>
        <div>
          {account.isPending ? (
            <LoadingSkeleton />
          ) : account.isError ? (
            <ErrorState
              message={errorMessage(account.error)}
              retry={() => void account.refetch()}
            />
          ) : (
            <BalanceCard account={account.data} />
          )}
          <div className="notice">
            <ShieldCheck size={21} />
            Tài khoản thanh toán độc lập với sinh viên. Bạn có thể thanh toán
            cho MSSV khác.
          </div>
        </div>
      </div>
    </div>
  );
}
