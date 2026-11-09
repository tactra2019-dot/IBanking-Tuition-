import { Navigate, Outlet, Route, Routes, Link } from "react-router-dom";
import { useAuth } from "../app/AuthContext";
import { AppLayout } from "../components/layout/AppLayout";
import { LoginPage } from "../pages/LoginPage";
import { DashboardPage } from "../pages/DashboardPage";
import { PaymentPage } from "../pages/PaymentPage";
import { OtpPage } from "../pages/OtpPage";
import { PaymentResultPage } from "../pages/PaymentResultPage";
import { TransactionHistoryPage } from "../pages/TransactionHistoryPage";
import { AccountPage } from "../pages/AccountPage";
function Protected() {
  return useAuth().user ? <Outlet /> : <Navigate to="/login" replace />;
}
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Protected />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/payment" element={<PaymentPage />} />
          <Route path="/payment/:paymentId/otp" element={<OtpPage />} />
          <Route
            path="/payment/:paymentId/result"
            element={<PaymentResultPage />}
          />
          <Route path="/transactions" element={<TransactionHistoryPage />} />
          <Route path="/account" element={<AccountPage />} />
        </Route>
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="*"
        element={
          <div className="empty-state">
            <h1>Không tìm thấy trang</h1>
            <Link className="button primary" to="/dashboard">
              Về trang chủ
            </Link>
          </div>
        }
      />
    </Routes>
  );
}
