import { useEffect, useState, type FormEvent } from "react";
import { UserRound, ShieldCheck } from "lucide-react";
import { useAuth } from "../app/AuthContext";
import { useAccount } from "../hooks/queries";
import { Button, InfoCard, Input, LoadingSkeleton, ErrorState } from "../components/ui";
import { BalanceCard } from "../components/payment/PaymentComponents";
import { authApi } from "../services/authApi";
import { errorMessage, isDemo } from "../services/client";

export function AccountPage() {
  const { user, updateEmail } = useAuth();
  const account = useAccount();
  const [email, setEmail] = useState(user?.email || "");
  const [password, setPassword] = useState("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { if (!pendingEmail) setEmail(user?.email || ""); }, [user?.email, pendingEmail]);

  const requestChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(""); setMessage(""); setBusy(true);
    try {
      const result = await authApi.requestEmailChange(email.trim(), password);
      setPendingEmail(result.email);
      setPassword("");
      setMessage(`Mã xác minh đã được gửi tới ${result.email}. Mã có hiệu lực 5 phút.`);
    } catch (cause) {
      setError(errorMessage(cause));
      if (errorMessage(cause).includes("kiểm tra hộp thư")) setPendingEmail(email.trim().toLowerCase());
    } finally { setBusy(false); }
  };

  const confirmChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(""); setMessage(""); setBusy(true);
    try {
      const result = await authApi.confirmEmailChange(code);
      updateEmail(result.email);
      setPendingEmail(null);
      setCode("");
      setMessage(`Đã cập nhật email nhận thông báo thành ${result.email}. Các giao dịch mới sẽ gửi OTP tới địa chỉ này.`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally { setBusy(false); }
  };

  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">TÀI KHOẢN CỦA TÔI</p>
          <h1>Thông tin tài khoản.</h1>
          <p>Thông tin người thanh toán được dùng để nhận mã OTP và kết quả giao dịch.</p>
        </div>
      </div>
      <div className="payment-grid">
        <InfoCard title="Thông tin cá nhân" icon={<UserRound />}>
          <div className="page-stack">
            <Input label="Họ và tên" value={user?.fullName || ""} readOnly />
            <Input label="Email nhận thông báo hiện tại" value={user?.email || ""} readOnly />
            <Input label="Số điện thoại" value={user?.phone || ""} readOnly />
            {!pendingEmail ? (
              <form className="email-change-form" onSubmit={(event) => void requestChange(event)}>
                <h3>Đổi email nhận thông báo</h3>
                <p className="muted">Email mới chỉ được sử dụng sau khi bạn nhập mã xác minh gửi tới địa chỉ đó.</p>
                <Input label="Email mới" type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={100} required autoComplete="email" />
                <Input label="Mật khẩu hiện tại" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
                <Button type="submit" busy={busy} disabled={!email || email.trim().toLowerCase() === user?.email.toLowerCase() || !password}>Gửi mã xác minh</Button>
              </form>
            ) : (
              <form className="email-change-form" onSubmit={(event) => void confirmChange(event)}>
                <h3>Xác minh email mới</h3>
                <p className="muted">Nhập mã 6 chữ số đã gửi tới <strong>{pendingEmail}</strong>. Email hiện tại vẫn được dùng cho đến khi xác minh xong.{isDemo && " Chế độ demo dùng mã 123456 và không gửi email thật."}</p>
                <Input label="Mã xác minh" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required autoComplete="one-time-code" />
                <div className="email-change-actions">
                  <Button type="submit" busy={busy} disabled={code.length !== 6}>Xác nhận email</Button>
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => { setPendingEmail(null); setCode(""); setError(""); setMessage(""); }}>Đổi địa chỉ khác</Button>
                </div>
              </form>
            )}
            {message && <p role="status" className="email-change-message">{message}</p>}
            {error && <p role="alert" className="field-error">{error}</p>}
          </div>
        </InfoCard>
        <div>
          {account.isPending ? <LoadingSkeleton /> : account.isError ? (
            <ErrorState message={errorMessage(account.error)} retry={() => void account.refetch()} />
          ) : <BalanceCard account={account.data} />}
          <div className="notice"><ShieldCheck size={21} />Tài khoản thanh toán độc lập với sinh viên. Bạn có thể thanh toán cho MSSV khác.</div>
        </div>
      </div>
    </div>
  );
}
