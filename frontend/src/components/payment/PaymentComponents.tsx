import { Link } from "react-router-dom";
import { ArrowUpRight, Wallet } from "lucide-react";
import type { Payment, Account } from "../../types";
import { money, dateTime } from "../../utils/format";
import { EmptyState, StatusBadge } from "../ui";
export function BalanceCard({ account }: { account: Account }) {
  return (
    <div className="balance-card">
      <div className="balance-heading">
        <span>
          <Wallet size={20} /> Số dư khả dụng
        </span>
        <span className="balance-chip">VND</span>
      </div>
      <strong>{money(account.balance)}</strong>
      <div className="balance-footer">
        <span>Tài khoản thanh toán</span>
        <b>{account.accountNumber}</b>
      </div>
      <span className="balance-orbit" />
    </div>
  );
}
export function TransactionTable({ items }: { items: Payment[] }) {
  if (!items.length) return <EmptyState />;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Giao dịch / Nội dung</th>
            <th>MSSV</th>
            <th>Số tiền</th>
            <th>Thời gian</th>
            <th>Trạng thái</th>
            <th>
              <span className="sr-only">Chi tiết</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id}>
              <td>
                <strong>{p.id}</strong>
                <small>{p.description}</small>
              </td>
              <td>{p.studentId}</td>
              <td className="amount-cell">{money(p.amount)}</td>
              <td>{dateTime(p.createdAt)}</td>
              <td>
                <StatusBadge status={p.status} />
              </td>
              <td>
                <Link
                  className="table-link"
                  to={`/payment/${p.id}/${p.status === "PENDING" ? "otp" : "result"}`}
                  aria-label={`Xem giao dịch ${p.id}`}
                >
                  <ArrowUpRight size={19} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function PaymentDetails({ payment }: { payment: Payment }) {
  return (
    <dl className="detail-list">
      <div>
        <dt>Mã giao dịch</dt>
        <dd>{payment.id}</dd>
      </div>
      <div>
        <dt>Mã số sinh viên</dt>
        <dd>{payment.studentId}</dd>
      </div>
      <div>
        <dt>Họ tên sinh viên</dt>
        <dd>{payment.studentName}</dd>
      </div>
      <div>
        <dt>Nội dung</dt>
        <dd>{payment.description}</dd>
      </div>
      <div>
        <dt>Thời gian</dt>
        <dd>{dateTime(payment.createdAt)}</dd>
      </div>
      <div>
        <dt>Số tiền thanh toán</dt>
        <dd className="money">{money(payment.amount)}</dd>
      </div>
    </dl>
  );
}
export function Steps({ current }: { current: number }) {
  return (
    <ol className="steps" aria-label="Tiến trình thanh toán">
      {["Thông tin học phí", "Xác thực OTP", "Kết quả giao dịch"].map(
        (s, i) => (
          <li
            key={s}
            className={i + 1 <= current ? "current" : ""}
            aria-current={i + 1 === current ? "step" : undefined}
          >
            <span>{i + 1 < current ? "✓" : i + 1}</span>
            {s}
          </li>
        ),
      )}
    </ol>
  );
}
