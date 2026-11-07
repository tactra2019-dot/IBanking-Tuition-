# Technical Research: Student & Payment Services

**Branch**: `001-payment-student-service`  
**Date**: 2026-11-07  

---

## 1. Concurrency Control & Data Consistency in PostgreSQL

### Decision
Sử dụng **PostgreSQL Row-Level Locking (`SELECT ... FOR UPDATE`)** kết hợp **Prisma Interactive Transaction (`prisma.$transaction(async (tx) => { ... })`)**.

### Rationale
- **Nghiệp vụ**:
  1. Khi thanh toán học phí: Một MSSV chỉ được có tối đa 1 giao dịch thành công. Tránh 2 người cùng đóng 1 MSSV.
  2. Khi trừ tiền tài khoản: Tránh 1 tài khoản gửi 2 giao dịch đồng thời làm số dư bị âm (double spending).
- **Cơ chế**:
  Trong Prisma Interactive Transaction, thực hiện khóa cả theo `account_id` (chống 1 tài khoản chạy song song nhiều giao dịch vượt số dư) lẫn khóa dòng `tuition_fees` (chống 2 tài khoản cùng đóng 1 MSSV):
  ```ts
  await prisma.$transaction(async (tx) => {
    // 1. Serialize các giao dịch trên cùng 1 tài khoản (chống double-spending)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${accountId}))`;

    // 2. Lock row tuition_fee chống 2 người thanh toán cùng 1 MSSV
    const [tuition]: any = await tx.$queryRaw`
      SELECT * FROM "tuition_fees" WHERE "id" = ${tuitionFeeId}::uuid FOR UPDATE
    `;
    if (!tuition || tuition.status === 'PAID') {
      throw new Error('TUITION_ALREADY_PAID_OR_INVALID');
    }

    // 3. Gọi Account Service trừ tiền (atomic balance check & deduct)
    await accountClient.deduct(accountId, Number(tuition.amount), paymentId);

    // 4. Cập nhật trạng thái học phí & giao dịch
    await tx.tuitionFee.update({
      where: { id: tuitionFeeId },
      data: { status: 'PAID' }
    });
    await tx.payment.update({
      where: { id: paymentId },
      data: { status: 'COMPLETED' }
    });
  });
  ```
- PostgreSQL khóa bản ghi ở mức dòng (Row-level lock). Khi 2 requests đồng thời chạy vào, request thứ 2 phải chờ (wait) hoặc bị từ chối nếu request 1 đã commit trạng thái `PAID`.
- Không cần thêm hạ tầng bên thứ ba (như Redis cluster) nhưng vẫn giải quyết 100% chuẩn ACID database.

### Alternatives Considered
- **Optimistic Locking (`version` column)**: Dễ xảy ra tranh chấp và phải retry ở tầng ứng dụng nếu xung đột cao. Đòi hỏi quản lý exception retry phức tạp.
- **Redis Distributed Lock (Redlock)**: Yêu cầu thêm Redis service, tăng độ phức tạp vận hành và rủi ro lock timeout khi transaction DB chạy lâu.

---

## 2. Framework & Runtime Selection

### Decision
- **Runtime**: Node.js (v20+ LTS / v22)
- **Language**: TypeScript (`tsx` runner để dev nhanh không cần build tsc trước)
- **HTTP Framework**: Express.js (gọn nhẹ, quen thuộc trong giáo trình SOA, dễ cấu hình middleware, CORS, logging)
- **ORM**: Prisma ORM (Type-safe, schema declarative, migration tự động, hỗ trợ `$transaction` và `$queryRaw`)
- **Database**: PostgreSQL (Docker container hoặc local instance)

### Alternatives Considered
- **NestJS**: Quá nặng, nhiều boilerplate decorators vi phạm tiêu chí Ponytail (giữ code gọn, đúng việc).
- **Fastify**: Nhanh nhưng Express phổ biến và đơn giản nhất trong đồ án SOA trường ĐH.

---

## 3. Email Notification for OTP & Receipt

### Decision
Sử dụng **Nodemailer** với chế độ fallback tự động:
1. Nếu có biến môi trường `SMTP_USER` & `SMTP_PASS` $\rightarrow$ Gửi qua Gmail / Real SMTP.
2. Nếu không cấu hình $\rightarrow$ Tự động tạo test account qua `nodemailer.createTestAccount()` (Ethereal Email) và in link xem email preview trực tiếp trên console terminal để giảng viên/sinh viên test mà không cần nhập mật khẩu email thật.

### Rationale
- Đảm bảo đồ án chạy được ngay lập tức sau khi `git clone` mà không bị nghẽn ở bước cấu hình SMTP credential.
- In mã OTP ra terminal log ở môi trường development để người kiểm thử copy/paste nhanh.

---

## 4. Inter-Service Communication & Mocking

### Decision
- Payment Service gọi Account Service qua HTTP REST:
  - `GET /api/accounts/:id`: Lấy số dư và thông tin người nộp.
  - `POST /api/accounts/deduct`: Trừ tiền tài khoản (yêu cầu transactionId / idempotency key).
- Đi kèm **Mock Account Service** (chạy kèm port `3001` hoặc trong test harness) để độc lập kiểm thử trước khi ghép nối với thành viên 1.

