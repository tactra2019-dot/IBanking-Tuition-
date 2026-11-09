import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  GraduationCap,
  History,
  ShieldCheck,
  UserRound,
  Mail,
  Phone,
  WalletCards,
  Activity,
} from "lucide-react";
import { useAuth } from "../app/AuthContext";
import { useAccount, usePayments } from "../hooks/queries";
import { BankingIllustration } from "../components/BankingIllustration";
import {
  BalanceCard,
  TransactionTable,
} from "../components/payment/PaymentComponents";
import { InfoCard, LoadingSkeleton, ErrorState } from "../components/ui";
import { errorMessage } from "../services/client";
export function DashboardPage() {
  const { user } = useAuth();
  const account = useAccount();
  const payments = usePayments();
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">TỔNG QUAN TÀI KHOẢN</p>
          <h1>
            Xin chào, {user?.fullName} <span className="greeting-dot" />
          </h1>
          <p>Chúc bạn một ngày tốt lành. Mọi giao dịch trong tầm tay.</p>
        </div>
        <span className="date-chip">
          {new Intl.DateTimeFormat("vi-VN", { dateStyle: "long" }).format(
            new Date(),
          )}
        </span>
      </div>
      <div className="dashboard-top">
        <section className="payment-hero">
          <div>
            <span className="hero-tag">
              <GraduationCap size={16} /> THANH TOÁN HỌC PHÍ TDTU
            </span>
            <h2>
              Học phí đã lo.
              <br />
              Tương lai rộng mở.
            </h2>
            <p>
              Thanh toán cho bạn và người thân.
              <br />
              Nhanh chóng, an toàn, thật dễ dàng.
            </p>
            <Link className="button hero-button" to="/payment">
              Thanh toán ngay <ArrowRight size={18} />
            </Link>
          </div>
          <BankingIllustration compact />
        </section>
        <div className="overview-stack">
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
          <div className="mini-stats">
            <InfoCard>
              <span className="stat-icon">
                <Activity size={20} />
              </span>
              <div>
                <span className="muted">Tổng giao dịch</span>
                <strong>
                  {payments.data?.total ?? "—"} <small>giao dịch</small>
                </strong>
              </div>
            </InfoCard>
            <InfoCard>
              <span className="stat-icon green">
                <ShieldCheck size={20} />
              </span>
              <div>
                <span className="muted">Tài khoản</span>
                <strong className="active-text">
                  {account.data?.status === "ACTIVE"
                    ? "Đang hoạt động"
                    : account.data
                      ? "Tạm khóa"
                      : "Đang tải"}
                </strong>
              </div>
            </InfoCard>
          </div>
        </div>
      </div>
      <div className="dashboard-bottom">
        <InfoCard
          title="Giao dịch gần đây"
          icon={<History size={20} />}
          className="recent-card"
        >
          <Link to="/transactions" className="view-all">
            Xem tất cả <ArrowRight size={15} />
          </Link>
          {payments.isPending ? (
            <LoadingSkeleton />
          ) : payments.isError ? (
            <ErrorState
              message={errorMessage(payments.error)}
              retry={() => void payments.refetch()}
            />
          ) : (
            <TransactionTable items={payments.data.items.slice(0, 3)} />
          )}
        </InfoCard>
        <InfoCard title="Thông tin của bạn" icon={<UserRound size={20} />}>
          <div className="profile-line">
            <span className="avatar large">TT</span>
            <div>
              <strong>{user?.fullName}</strong>
              <p>Chủ tài khoản thanh toán</p>
            </div>
          </div>
          <div className="contact-line">
            <Mail size={17} />
            <span>{user?.email}</span>
          </div>
          <div className="contact-line">
            <Phone size={17} />
            <span>{user?.phone}</span>
          </div>
          <Link className="account-link" to="/account">
            Xem thông tin tài khoản <ArrowUpRight size={17} />
          </Link>
        </InfoCard>
      </div>
      <div className="quick-links">
        {[
          [
            GraduationCap,
            "/payment",
            "Thanh toán học phí",
            "Tra cứu bằng mã số sinh viên",
          ],
          [
            History,
            "/transactions",
            "Lịch sử giao dịch",
            "Theo dõi từng khoản thanh toán",
          ],
          [
            WalletCards,
            "/account",
            "Tài khoản của tôi",
            "Quản lý thông tin cá nhân",
          ],
        ].map(([Icon, path, title, subtitle]) => {
          const I = Icon as typeof History;
          return (
            <Link to={String(path)} key={String(path)}>
              <span className="icon-box">
                <I size={24} />
              </span>
              <div>
                <strong>{String(title)}</strong>
                <p>{String(subtitle)}</p>
              </div>
              <ArrowRight size={18} />
            </Link>
          );
        })}
      </div>
      <div className="security-line">
        <ShieldCheck size={17} />
        <span>
          Giao dịch được xác thực bằng OTP. Chỉ thanh toán khi bạn đã kiểm tra
          thông tin sinh viên.
        </span>
      </div>
    </div>
  );
}
