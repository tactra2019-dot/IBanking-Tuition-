import { randomUUID } from "node:crypto";
export class ApiError extends Error {
  constructor(status, message, code = "VALIDATION_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const fail = (status, message, code) => {
  throw new ApiError(status, message, code);
};
export function createBank({ now = () => Date.now() } = {}) {
  const user = {
    id: "demo-user",
    fullName: "Võ Tấn Tài",
    phone: "0902 345 678",
    email: "tai.demo@example.com",
  };
  const account = {
    accountNumber: "••••  ••••  1024",
    balance: 15200000,
    status: "ACTIVE",
    currency: "VND",
  };
  const students = new Map([
    [
      "52200001",
      {
        id: "52200001",
        fullName: "Nguyễn Minh Anh",
        amount: 7500000,
        tuitionStatus: "UNPAID",
        semester: "Học kỳ 1 · 2026–2027",
      },
    ],
    [
      "52200002",
      {
        id: "52200002",
        fullName: "Trần Hoàng Nam",
        amount: 7200000,
        tuitionStatus: "PAID",
        semester: "Học kỳ 1 · 2026–2027",
      },
    ],
    [
      "52200003",
      {
        id: "52200003",
        fullName: "Lê Thu Hà",
        amount: 25000000,
        tuitionStatus: "UNPAID",
        semester: "Học kỳ 1 · 2026–2027",
      },
    ],
    [
      "52200004",
      {
        id: "52200004",
        fullName: "Phạm Gia Huy",
        amount: 4500000,
        tuitionStatus: "UNPAID",
        semester: "Học kỳ 1 · 2026–2027",
      },
    ],
    [
      "52200005",
      {
        id: "52200005",
        fullName: "Đỗ Ngọc Linh",
        amount: 5000000,
        tuitionStatus: "UNPAID",
        semester: "Học kỳ 1 · 2026–2027",
      },
    ],
    [
      "52200006",
      {
        id: "52200006",
        fullName: "Bùi Minh Khang",
        amount: 0,
        tuitionStatus: "NONE",
        semester: "Chưa có khoản học phí",
      },
    ],
  ]);
  const transactions = new Map();
  const sessions = new Set();
  const keys = new Map();
  ["SUCCESS", "SUCCESS", "FAILED"].forEach((status, i) => {
    const id = `DEMO-2026-00${i + 1}`;
    transactions.set(id, {
      id,
      studentId: "52200001",
      studentName: "Nguyễn Minh Anh",
      amount: [7200000, 6800000, 7200000][i],
      status,
      createdAt: new Date(now() - (i + 1) * 86400000 * 30).toISOString(),
      description: `Học phí học kỳ ${3 - i} · 2025–2026`,
    });
  });
  const publicPayment = (p) => {
    const { attempts, resends, used, ...data } = p;
    return structuredClone({
      ...data,
      canResend: p.status === "PENDING" && !used && resends < 2 && attempts < 5,
    });
  };
  const get = (id) =>
    transactions.get(id) ||
    fail(404, "Không tìm thấy giao dịch.", "PAYMENT_NOT_FOUND");
  const student = (id) =>
    students.get(id) ||
    fail(
      404,
      "Không tìm thấy MSSV. Vui lòng kiểm tra và thử lại.",
      "STUDENT_NOT_FOUND",
    );
  return {
    login(username, password) {
      if (username !== "tai.demo" || password !== "Demo@123")
        fail(
          401,
          "Tên đăng nhập hoặc mật khẩu không đúng.",
          "INVALID_CREDENTIALS",
        );
      const token = randomUUID();
      sessions.add(token);
      return { accessToken: token, user: structuredClone(user) };
    },
    authorize(token) {
      if (!sessions.has(token))
        fail(
          401,
          "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
          "UNAUTHORIZED",
        );
    },
    logout(token) {
      sessions.delete(token);
    },
    account: () => structuredClone(account),
    user: () => structuredClone(user),
    student: (id) => structuredClone(student(id)),
    list({ status, page = 1, pageSize = 5 } = {}) {
      const all = [...transactions.values()]
        .filter((p) => !status || p.status === status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return {
        items: all
          .slice((page - 1) * pageSize, page * pageSize)
          .map(publicPayment),
        total: all.length,
        page,
        pageSize,
      };
    },
    get: (id) => publicPayment(get(id)),
    create(studentId, key) {
      if (!key || key.length > 100)
        fail(400, "Thiếu khóa chống tạo giao dịch lặp.");
      if (keys.has(key)) {
        const previous = get(keys.get(key));
        if (previous.studentId !== studentId)
          fail(409, "Khóa giao dịch đã được sử dụng cho MSSV khác.");
        return publicPayment(previous);
      }
      const s = student(studentId);
      if (s.tuitionStatus !== "UNPAID" || s.amount <= 0)
        fail(
          409,
          "Học phí đã thanh toán hoặc chưa có khoản phải thu.",
          "TUITION_UNAVAILABLE",
        );
      if (account.balance < s.amount)
        fail(409, "Số dư khả dụng không đủ.", "INSUFFICIENT_BALANCE");
      if (
        [...transactions.values()].some(
          (p) =>
            p.studentId === studentId &&
            (p.status === "PROCESSING" ||
              (p.status === "PENDING" &&
                !p.used &&
                p.attempts < 5 &&
                new Date(p.expiresAt).getTime() > now())),
        )
      )
        fail(
          409,
          "Đã có giao dịch chờ xác nhận cho MSSV này. Hãy mở lịch sử để tiếp tục.",
          "PAYMENT_EXISTS",
        );
      const p = {
        id: `DEMO-${randomUUID().slice(0, 8).toUpperCase()}`,
        studentId,
        studentName: s.fullName,
        amount: s.amount,
        status: "PENDING",
        createdAt: new Date(now()).toISOString(),
        expiresAt: new Date(now() + 300000).toISOString(),
        resendAvailableAt: new Date(now() + 30000).toISOString(),
        email: "t***@example.com",
        description: s.semester,
        attempts: 0,
        resends: 0,
        used: false,
      };
      transactions.set(p.id, p);
      keys.set(key, p.id);
      return publicPayment(p);
    },
    verify(id, otp) {
      const p = get(id);
      if (p.used || p.status !== "PENDING")
        fail(
          409,
          "OTP đã được sử dụng hoặc giao dịch không còn chờ xác nhận.",
          "OTP_USED",
        );
      if (p.attempts >= 5)
        fail(
          429,
          "Đã vượt quá 5 lần nhập OTP. Vui lòng tạo giao dịch mới.",
          "OTP_ATTEMPTS_EXCEEDED",
        );
      if (new Date(p.expiresAt).getTime() <= now())
        fail(410, "OTP đã hết hạn. Vui lòng yêu cầu mã mới.", "OTP_EXPIRED");
      p.attempts++;
      if (otp !== "123456")
        fail(
          400,
          `OTP không đúng. Còn ${5 - p.attempts} lần thử.`,
          "OTP_INVALID",
        );
      p.used = true;
      const s = student(p.studentId);
      if (
        s.tuitionStatus !== "UNPAID" ||
        account.balance < p.amount ||
        p.studentId === "52200005"
      ) {
        p.status = "FAILED";
        p.failureReason = "Giao dịch không thể hoàn tất. Số dư chưa bị trừ.";
      } else if (p.studentId === "52200004") p.status = "PROCESSING";
      else {
        account.balance -= p.amount;
        s.tuitionStatus = "PAID";
        p.status = "SUCCESS";
      }
      return publicPayment(p);
    },
    resend(id) {
      const p = get(id);
      if (p.status !== "PENDING" || p.used)
        fail(409, "Giao dịch không còn chờ OTP.", "OTP_USED");
      if (p.resends >= 2 || p.attempts >= 5)
        fail(429, "Đã đạt giới hạn gửi hoặc nhập OTP.", "OTP_LIMIT");
      if (new Date(p.resendAvailableAt).getTime() > now())
        fail(429, "Vui lòng chờ 30 giây trước khi gửi lại.", "OTP_COOLDOWN");
      p.resends++;
      p.expiresAt = new Date(now() + 300000).toISOString();
      p.resendAvailableAt = new Date(now() + 30000).toISOString();
      return publicPayment(p);
    },
  };
}
