import { useEffect, useState } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import {
  GraduationCap,
  LayoutDashboard,
  History,
  WalletCards,
  LogOut,
  ShieldCheck,
  Menu,
  CircleHelp,
  Headphones,
  ChevronRight,
  X,
} from "lucide-react";
import { useAuth } from "../../app/AuthContext";
import { isDemo } from "../../services/client";
import { ConfirmationModal } from "../ui";
export function Brand() {
  return (
    <Link
      to="/dashboard"
      className="brand"
      aria-label="iBanking Học Phí - Trang chủ"
    >
      <span className="brand-icon">
        <GraduationCap size={31} />
      </span>
      <span>
        iBanking <b>Học Phí</b>
        <small>TON DUC THANG UNIVERSITY</small>
      </span>
    </Link>
  );
}
export function Header({ onMenu }: { onMenu?: () => void }) {
  const { user, logout } = useAuth();
  const [help, setHelp] = useState(false);
  return (
    <>
      <header className="header">
        <div className="header-brand">
          {onMenu && (
            <button
              className="icon-button mobile-menu"
              onClick={onMenu}
              aria-label="Mở menu"
            >
              <Menu />
            </button>
          )}
          <Brand />
        </div>
        <span className="header-tagline">
          Hệ thống thanh toán học phí trực tuyến
        </span>
        <div className="header-actions">
          <button className="text-button" aria-label="Hướng dẫn" onClick={() => setHelp(true)}>
            <CircleHelp size={18} />
            <span>Hướng dẫn</span>
          </button>
          {user && (
            <>
              <span className="header-divider" />
              <Link to="/account" className="user-chip">
                <span className="avatar">TT</span>
                <span>
                  {user.fullName}
                  <small>Tài khoản cá nhân</small>
                </span>
              </Link>
              <button
                className="icon-button"
                onClick={logout}
                aria-label="Đăng xuất"
              >
                <LogOut size={19} />
              </button>
            </>
          )}
        </div>
      </header>
      <ConfirmationModal
        open={help}
        title="Thanh toán học phí trong 3 bước"
        onClose={() => setHelp(false)}
      >
        <ol className="guide">
          <li>Nhập MSSV và kiểm tra thông tin học phí.</li>
          <li>Xác nhận giao dịch, nhập mã OTP nhận qua email.</li>
          <li>Kiểm tra kết quả được máy chủ xác nhận trong lịch sử.</li>
        </ol>
        <p>
          Bạn có thể thanh toán cho sinh viên khác. Học phí phải được thanh toán
          toàn bộ.
        </p>
        {isDemo && (
          <p className="notice">
            Bản demo: đăng nhập tai.demo / Demo@123; MSSV 52200001; OTP mô phỏng
            123456. Không gửi email hay chuyển tiền thật.
          </p>
        )}
      </ConfirmationModal>
    </>
  );
}
export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { logout } = useAuth();
  return (
    <>
      <button
        className={`sidebar-scrim ${open ? "visible" : ""}`}
        onClick={onClose}
        aria-label="Đóng menu"
        tabIndex={open ? 0 : -1}
      />
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-label">
          KHÔNG GIAN CỦA BẠN{" "}
          <button
            className="icon-button mobile-menu"
            onClick={onClose}
            aria-label="Đóng menu"
          >
            <X size={18} />
          </button>
        </div>
        <nav aria-label="Điều hướng chính">
          {[
            [LayoutDashboard, "/dashboard", "Tổng quan"],
            [GraduationCap, "/payment", "Thanh toán học phí"],
            [History, "/transactions", "Lịch sử giao dịch"],
            [WalletCards, "/account", "Tài khoản của tôi"],
          ].map(([Icon, path, label]) => {
            const I = Icon as typeof History;
            return (
              <NavLink
                key={String(path)}
                to={String(path)}
                onClick={onClose}
                className={({ isActive }) =>
                  `nav-item ${isActive ? "active" : ""}`
                }
              >
                <I size={21} />
                {String(label)}
                <ChevronRight size={15} />
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-security">
            <ShieldCheck size={29} />
            <strong>An tâm mỗi giao dịch</strong>
            <p>Xác thực OTP giúp bảo vệ tài khoản của bạn.</p>
          </div>
          <button onClick={logout} className="nav-item logout">
            <LogOut size={19} />
            Đăng xuất
          </button>
          <div className="sidebar-footer">
            <Headphones size={16} /> iBanking · TDTU
          </div>
        </div>
      </aside>
    </>
  );
}
export function AppLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" }); }, [location.pathname]);
  return (
    <>
      <a className="skip-link" href="#main">
        Đến nội dung chính
      </a>
      <Header onMenu={() => setOpen(!open)} />
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="app-content">
        {isDemo && (
          <div className="demo-bar">
            <span className="demo-pill">DEMO</span> Môi trường mô phỏng · Không
            chuyển tiền hoặc gửi email thật
          </div>
        )}
        <main id="main" key={location.pathname}>
          <Outlet />
        </main>
        <footer className="page-footer">
          <span>© 2026 iBanking Học Phí · TDTU</span>
          <span>
            <ShieldCheck size={14} /> Thanh toán an toàn, học tập an tâm
          </span>
        </footer>
      </div>
    </>
  );
}
