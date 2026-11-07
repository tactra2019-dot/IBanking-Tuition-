# Quickstart Guide: Student & Payment Services

**Branch**: `001-payment-student-service`  
**Date**: 2026-11-07  

---

## 1. Yêu cầu môi trường
- Node.js >= 20.x LTS hoặc 22.x
- PostgreSQL >= 14 (Chạy trực tiếp trên máy hoặc qua Docker Compose)
- npm hoặc pnpm / yarn

---

## 2. Cài đặt và Cấu hình

### Khởi động PostgreSQL qua Docker (Nếu chưa có sẵn DB)
```bash
docker compose up -d
```

### Biến môi trường (`.env`)
Tạo file `.env` tại thư mục gốc của từng service (hoặc root):
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/ibanking_db?schema=public"
PORT_STUDENT=4001
PORT_PAYMENT=4002
PORT_ACCOUNT_MOCK=4003

# Email SMTP (Bỏ trống sẽ tự động dùng Ethereal test inbox và in link xem mail ra console)
SMTP_HOST=""
SMTP_PORT=587
SMTP_USER=""
SMTP_PASS=""
```

---

## 3. Chạy Migration & Seed Dữ liệu mẫu
```bash
# Cài đặt dependencies
npm install

# Sinh Prisma Client & Đồng bộ Database Schema
npx prisma db push

# Chạy seed dữ liệu sinh viên mẫu và nợ học phí
npm run seed
```

---

## 4. Khởi chạy Services
```bash
# Chạy đồng thời Student Service, Payment Service và Mock Account Service
npm run dev
```

---

## 5. Chạy Kiểm thử Concurrency (Chống thanh toán trùng)
```bash
# Chạy script test 2 người cùng đóng 1 MSSV đồng thời và 1 tài khoản gửi nhiều request cùng lúc
npm run test:concurrency
```

