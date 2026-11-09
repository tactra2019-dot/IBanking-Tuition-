import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowRight,
  Eye,
  EyeOff,
  ShieldCheck,
  Zap,
  Layers,
  LockKeyhole,
} from "lucide-react";
import { Header } from "../components/layout/AppLayout";
import { BankingIllustration } from "../components/BankingIllustration";
import { Button, Input, ErrorState } from "../components/ui";
import { useAuth } from "../app/AuthContext";
import { errorMessage, isDemo } from "../services/client";
const schema = z.object({
  username: z.string().trim().min(1, "Vui lòng nhập tên đăng nhập."),
  password: z.string().min(1, "Vui lòng nhập mật khẩu."),
  remember: z.boolean(),
});
function remembered() {
  try {
    return localStorage.getItem("remembered-username") || "";
  } catch {
    return "";
  }
}
export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: remembered(),
      password: "",
      remember: !!remembered(),
    },
  });
  if (user) return <Navigate to="/dashboard" replace />;
  return (
    <div className="login-page">
      <Header />
      <main className="login-main">
        <section className="login-story">
          <div className="eyebrow">
            <span /> ĐỒNG HÀNH CÙNG HÀNH TRÌNH TRI THỨC
          </div>
          <h1>
            Thanh toán học phí.
            <br />
            <span>An tâm học tập.</span>
          </h1>
          <p className="login-lead">
            Một kết nối nhỏ, mở lối tương lai.
            <br />
            Thanh toán học phí TDTU an toàn, nhanh chóng
            <br className="desktop-break" /> và thuận tiện ngay tại đây.
          </p>
          <div className="login-visual">
            <div className="login-features">
              {[
                [
                  ShieldCheck,
                  "An toàn, bảo mật",
                  "Xác thực giao dịch bằng OTP",
                ],
                [
                  Zap,
                  "Nhanh chóng, thuận tiện",
                  "Thanh toán chỉ với vài thao tác",
                ],
                [Layers, "Quản lý dễ dàng", "Theo dõi giao dịch minh bạch"],
              ].map(([Icon, title, description]) => {
                const I = Icon as typeof ShieldCheck;
                return (
                  <div className="feature" key={String(title)}>
                    <span className="icon-box">
                      <I size={23} />
                    </span>
                    <div>
                      <strong>{String(title)}</strong>
                      <p>{String(description)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <BankingIllustration />
          </div>
          <div className="university-line">
            <GraduationMark />{" "}
            <span>
              TRƯỜNG ĐẠI HỌC TÔN ĐỨC THẮNG
              <br />
              <b>Đầu tư cho tri thức, kiến tạo tương lai.</b>
            </span>
          </div>
        </section>
        <section className="login-card">
          <span className="login-lock">
            <LockKeyhole size={27} />
          </span>
          <p className="eyebrow">CHÀO MỪNG BẠN TRỞ LẠI</p>
          <h2>Đăng nhập hệ thống</h2>
          <p className="muted">Kết nối tài khoản, tiếp nối hành trình.</p>
          <form
            onSubmit={handleSubmit(async (values) => {
              setError("");
              try {
                await login(values.username, values.password);
                try {
                  if (values.remember)
                    localStorage.setItem(
                      "remembered-username",
                      values.username,
                    );
                  else localStorage.removeItem("remembered-username");
                } catch {
                  /* Storage is optional. */
                }
                navigate("/dashboard", { replace: true });
              } catch (e) {
                setError(errorMessage(e));
              }
            })}
            noValidate
          >
            <Input
              label="Tên đăng nhập"
              placeholder="Nhập tên đăng nhập"
              autoComplete="username"
              {...register("username")}
              error={errors.username?.message}
            />
            <div className="password-field">
              <Input
                label="Mật khẩu"
                placeholder="Nhập mật khẩu"
                type={visible ? "text" : "password"}
                autoComplete="current-password"
                {...register("password")}
                error={errors.password?.message}
              />
              <button
                type="button"
                aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                className="password-toggle"
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            <label className="checkbox-label">
              <input type="checkbox" {...register("remember")} />
              Ghi nhớ tên đăng nhập
            </label>
            {error && <ErrorState message={error} />}
            <Button type="submit" className="full-width" busy={isSubmitting}>
              Đăng nhập <ArrowRight size={19} />
            </Button>
          </form>
          <div className="login-note">
            <ShieldCheck size={21} />
            <p>
              Thông tin của bạn được bảo vệ.
              <br />
              Không chia sẻ mật khẩu hoặc mã OTP.
            </p>
          </div>
          {isDemo && (
            <div className="demo-credentials">
              <span className="demo-pill">DEMO</span>
              <p>
                Tài khoản: <b>tai.demo</b> · Mật khẩu: <b>Demo@123</b>
                <br />
                Dữ liệu mô phỏng, không có giao dịch thật.
              </p>
            </div>
          )}
        </section>
      </main>
      <footer className="login-footer">
        <span>© 2026 iBanking Học Phí. Dự án môn SOA · TDTU.</span>
        <span>Thiết kế cho một hành trình học tập trọn vẹn.</span>
      </footer>
    </div>
  );
}
function GraduationMark() {
  return (
    <span className="tdtu-mark">
      TDT<span>U</span>
    </span>
  );
}
