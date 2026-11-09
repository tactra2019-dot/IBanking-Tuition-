import {
  useEffect,
  useRef,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { AlertCircle, ArrowRight, Inbox, LoaderCircle, X } from "lucide-react";
import type { Status } from "../../types";
export function Button({
  children,
  busy,
  variant = "primary",
  className = "",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <button
      {...props}
      disabled={disabled || busy}
      className={`button ${variant} ${className}`}
      aria-busy={busy}
    >
      {busy && <LoaderCircle className="spin" size={18} />} {children}
    </button>
  );
}
export function Input({
  label,
  error,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const generated = useId();
  const inputId = id || generated;
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <input
        {...props}
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : undefined}
      />
      {error && (
        <span role="alert" className="field-error" id={`${inputId}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}
export function InfoCard({
  title,
  icon,
  children,
  className = "",
}: {
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <h2 className="card-title">
          {icon && <span className="icon-box">{icon}</span>}
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
const labels: Record<Status, string> = {
  SUCCESS: "Thành công",
  FAILED: "Thất bại",
  PENDING: "Chờ xác thực",
  PROCESSING: "Đang xử lý",
};
export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`badge ${status.toLowerCase()}`}>
      <span className="status-dot" />
      {labels[status] ?? "Chưa xác định"}
    </span>
  );
}
export function LoadingSkeleton() {
  return (
    <div role="status" aria-label="Đang tải dữ liệu" className="skeleton-group">
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}
export function EmptyState({
  message = "Chưa có giao dịch phù hợp.",
}: {
  message?: string;
}) {
  return (
    <div className="empty-state">
      <Inbox size={36} />
      <p>{message}</p>
    </div>
  );
}
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div role="alert" className="error-state">
      <AlertCircle size={20} />
      <span>{message}</span>
      {retry && (
        <Button variant="ghost" onClick={retry}>
          Thử lại <ArrowRight size={16} />
        </Button>
      )}
    </div>
  );
}
export function ConfirmationModal({
  open,
  title,
  children,
  onClose,
  onConfirm,
  busy,
  confirmText = "Xác nhận giao dịch",
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  onConfirm?: () => void;
  busy?: boolean;
  confirmText?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    if (!open) ref.current?.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      className="modal"
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          disabled={busy}
          aria-label="Đóng"
        >
          <X />
        </button>
      </div>
      <div className="modal-body">{children}</div>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {onConfirm ? "Kiểm tra lại" : "Đã hiểu"}
        </Button>
        {onConfirm && (
          <Button onClick={onConfirm} busy={busy}>
            {confirmText}
          </Button>
        )}
      </div>
    </dialog>
  );
}
