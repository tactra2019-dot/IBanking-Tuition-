import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  UserRound,
  Search,
  GraduationCap,
  ShieldCheck,
  ArrowRight,
  CircleCheck,
  Wallet,
} from "lucide-react";
import { useAuth } from "../app/AuthContext";
import { useAccount } from "../hooks/queries";
import { studentApi } from "../services/studentApi";
import { paymentApi } from "../services/paymentApi";
import { errorMessage, isDemo } from "../services/client";
import {
  Button,
  Input,
  InfoCard,
  ErrorState,
  LoadingSkeleton,
  ConfirmationModal,
} from "../components/ui";
import { Steps } from "../components/payment/PaymentComponents";
import { money } from "../utils/format";
import type { Student } from "../types";
const schema = z.object({
  studentId: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9]{6,15}$/, "MSSV gồm 6–15 ký tự chữ hoặc số."),
});
export function PaymentPage() {
  const { user } = useAuth();
  const account = useAccount();
  const navigate = useNavigate();
  const query = useQueryClient();
  const [student, setStudent] = useState<Student | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [modal, setModal] = useState(false);
  const key = useRef("");
  const locked = useRef(false);
  const lookupVersion = useRef(0);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const lookup = useMutation({ mutationFn: studentApi.lookup });
  const create = useMutation({
    mutationFn: () => paymentApi.create(student!.id, key.current),
    onSuccess: (p) => {
      query.invalidateQueries({ queryKey: ["payments"] });
      navigate(`/payment/${p.id}/otp`);
    },
  });
  const eligible =
    !!student &&
    student.tuitionStatus === "UNPAID" &&
    student.amount > 0 &&
    !!account.data &&
    account.data.status === "ACTIVE" &&
    account.data.balance >= student.amount;
  return (
    <div className="page-stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">THANH TOÁN HỌC PHÍ</p>
          <h1>Một bước gần hơn đến tương lai.</h1>
          <p>Tra cứu và thanh toán toàn bộ học phí cho sinh viên TDTU.</p>
        </div>
      </div>
      <Steps current={1} />
      <div className="payment-grid">
        <div className="page-stack">
          <InfoCard
            title="Thông tin người thanh toán"
            icon={<UserRound size={21} />}
          >
            <div className="payer-fields">
              <Input label="Họ và tên" value={user?.fullName || ""} readOnly />
              <Input label="Số điện thoại" value={user?.phone || ""} readOnly />
              <Input label="Địa chỉ email" value={user?.email || ""} readOnly />
            </div>
            <p className="caption">
              Thông tin được lấy từ tài khoản đang đăng nhập.
            </p>
          </InfoCard>
          <InfoCard title="Tra cứu sinh viên" icon={<Search size={21} />}>
            <p className="muted">
              Bạn có thể thanh toán học phí cho mình hoặc người thân.
            </p>
            <form
              className="lookup-form"
              noValidate
              onSubmit={handleSubmit(async ({ studentId }) => {
                const version = ++lookupVersion.current;
                setStudent(null);
                setConfirmed(false);
                create.reset();
                try {
                  const found = await lookup.mutateAsync(studentId);
                  if (version === lookupVersion.current) {
                    setStudent(found);
                    key.current = crypto.randomUUID();
                  }
                } catch {
                  /* Render mutation error. */
                }
              })}
            >
              <Input
                label="Mã số sinh viên (MSSV)"
                placeholder="Ví dụ: 52200001"
                {...register("studentId", {
                  onChange: () => {
                    lookupVersion.current++;
                    setStudent(null);
                    setConfirmed(false);
                    lookup.reset();
                    create.reset();
                  },
                })}
                error={errors.studentId?.message}
              />
              <Button type="submit" busy={lookup.isPending}>
                <Search size={18} />
                Tra cứu
              </Button>
            </form>
            {lookup.isError && (
              <ErrorState message={errorMessage(lookup.error)} />
            )}{" "}
            {isDemo && (
              <p className="demo-hint">
                MSSV demo: <b>52200001</b> · Đã trả: <b>52200002</b> · Thiếu số
                dư: <b>52200003</b>
              </p>
            )}
          </InfoCard>
          {lookup.isPending && <LoadingSkeleton />}
          {student && (
            <InfoCard
              title="Thông tin học phí"
              icon={<GraduationCap size={22} />}
            >
              <div className="student-summary">
                <span className="avatar large">
                  <GraduationCap />
                </span>
                <div>
                  <h3>{student.fullName}</h3>
                  <p>
                    MSSV {student.id} · {student.semester}
                  </p>
                </div>
                <span
                  className={`badge ${student.tuitionStatus === "PAID" ? "success" : "pending"}`}
                >
                  {student.tuitionStatus === "PAID"
                    ? "Đã thanh toán"
                    : student.tuitionStatus === "NONE"
                      ? "Chưa có học phí"
                      : "Chưa thanh toán"}
                </span>
              </div>
              <div className="tuition-amount">
                <span>Học phí cần thanh toán</span>
                <strong>{money(student.amount)}</strong>
              </div>
              <p className="caption">
                Thanh toán toàn bộ khoản học phí. Số tiền do hệ thống cung cấp
                và không thể chỉnh sửa.
              </p>
              {student.tuitionStatus !== "UNPAID" && (
                <div className="notice">
                  {student.tuitionStatus === "PAID"
                    ? "Khoản học phí này đã được thanh toán."
                    : "Sinh viên chưa có khoản học phí cần thanh toán."}
                </div>
              )}
            </InfoCard>
          )}
        </div>
        <aside className="payment-side">
          <InfoCard title="Chi tiết thanh toán" icon={<Wallet size={21} />}>
            {account.isPending ? (
              <LoadingSkeleton />
            ) : account.isError ? (
              <ErrorState
                message={errorMessage(account.error)}
                retry={() => void account.refetch()}
              />
            ) : (
              <>
                <dl className="detail-list">
                  <div>
                    <dt>Tài khoản nguồn</dt>
                    <dd>{account.data.accountNumber}</dd>
                  </div>
                  <div>
                    <dt>Số dư khả dụng</dt>
                    <dd>{money(account.data.balance)}</dd>
                  </div>
                </dl>
                <div className="payment-total">
                  <span>Tổng thanh toán</span>
                  <strong>{student ? money(student.amount) : "—"}</strong>
                  <small>Không thu phí giao dịch</small>
                </div>
                {student && (
                  <div className={eligible ? "balance-valid" : "error-state"}>
                    {eligible ? (
                      <>
                        <CircleCheck size={17} /> Số dư đủ để thanh toán
                      </>
                    ) : student.tuitionStatus !== "UNPAID" ? (
                      "Khoản học phí không thể thanh toán."
                    ) : account.data.status !== "ACTIVE" ? (
                      "Tài khoản chưa hoạt động."
                    ) : (
                      "Số dư không đủ để thanh toán."
                    )}
                  </div>
                )}
              </>
            )}
            <label className="checkbox-label consent">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={!eligible || create.isPending}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                Tôi đã kiểm tra thông tin sinh viên và đồng ý thanh toán toàn bộ
                học phí.
              </span>
            </label>
            <Button
              className="full-width"
              disabled={!eligible || !confirmed}
              busy={create.isPending}
              onClick={() => setModal(true)}
            >
              Xác nhận giao dịch <ArrowRight size={17} />
            </Button>
            <p className="caption centered">
              Bạn sẽ xác thực bằng mã OTP ở bước tiếp theo.
            </p>
            {create.isError && (
              <ErrorState message={errorMessage(create.error)} />
            )}
          </InfoCard>
          <div className="payment-security">
            <ShieldCheck size={24} />
            <div>
              <strong>Bạn luôn là người xác nhận</strong>
              <p>
                Kiểm tra đúng MSSV trước khi thanh toán. Không chia sẻ mã OTP
                cho bất kỳ ai.
              </p>
            </div>
          </div>
        </aside>
      </div>
      <ConfirmationModal
        open={modal}
        title="Xác nhận thông tin thanh toán"
        onClose={() => {
          if (!locked.current) setModal(false);
        }}
        busy={create.isPending}
        onConfirm={async () => {
          if (locked.current || !eligible || !confirmed) return;
          locked.current = true;
          try {
            await create.mutateAsync();
          } catch {
            setModal(false);
          } finally {
            locked.current = false;
          }
        }}
      >
        <p>
          Thanh toán học phí cho <strong>{student?.fullName}</strong> · MSSV{" "}
          <strong>{student?.id}</strong>.
        </p>
        <p className="modal-amount">{money(student?.amount || 0)}</p>
        <p>
          Giao dịch chỉ hoàn tất sau khi bạn xác thực OTP và máy chủ xác nhận
          thành công.
        </p>
      </ConfirmationModal>
    </div>
  );
}
