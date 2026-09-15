# Digital_Work Backend (Node.js/Express + PostgreSQL 17)

## 1. Setup

```bash
cd backend
npm install
cp .env.example .env   # roi sua DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET cho dung moi truong
```

## 2. Chay migrations

Mo pgAdmin 4 → Query Tool tren database `pro_sale` → chay lan luot theo thu tu (KHONG doi thu tu vi co FK phu thuoc):

```
migrations/001_alter_users.sql
migrations/002_create_projects.sql
migrations/003_alter_digital_works.sql
migrations/004_create_task_plans.sql
migrations/005_create_refresh_tokens.sql
migrations/006_create_activity_logs.sql
```

Sau khi chay 001, neu bang `users` dang co gia tri `role` nam ngoai `admin/manager/user`, cau lenh se bao loi
constraint — chay `SELECT DISTINCT role FROM "users";` truoc va `UPDATE` chuan hoa lai roi chay lai 001.

Sau khi chay 003, mo `migrations/999_smoke_test.sql` phan (1) de xem cac dong `digital_works.assistant`
chua khop duoc `assigned_to` (ten khong trung voi `users.name`) va sua tay tren pgAdmin.

## 3. Tao admin dau tien

```bash
node scripts/seedAdmin.js admin@example.com "Admin@12345" "Super Admin"
```

## 4. Chay server

```bash
npm run dev     # hoac: npm start
```

Kiem tra: `GET http://localhost:3000/api/auth/test` → `{ "message": "DB connection is healthy" }` (chi hoat dong khi `NODE_ENV=development`).

## 5. Smoke test API

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='Admin@12345' bash test/smoke.sh
```

Script se: login admin → tao 1 manager + 1 user → tao project → tao task giao cho user → user cap nhat
tien do task cua minh (200) → user tao 1 buoc task_plan (201) → user thu cap nhat task khong thuoc ve minh (403).
