// Tao (hoac cap nhat) 1 tai khoan admin dau tien - chay 1 lan sau khi migrate xong.
// Ly do can script rieng: API /api/users chi Admin moi goi duoc -> chicken-and-egg,
// can 1 admin dau tien tao truc tiep qua DB.
//
// Chay: node scripts/seedAdmin.js <email> <password> [name]
// Vi du: node scripts/seedAdmin.js admin@example.com Admin@12345 "Super Admin"

require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('../src/db');

async function main() {
  const [email, password, name] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: node scripts/seedAdmin.js <email> <password> [name]');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS) || 12);

  const { rows } = await db.query(
    `INSERT INTO "users" (name, email, role, password_hash, status)
     VALUES ($1, $2, 'admin', $3, 'active')
     ON CONFLICT (email) DO UPDATE
       SET role = 'admin', password_hash = EXCLUDED.password_hash, status = 'active'
     RETURNING id, name, email, role, status`,
    [name || 'Admin', email, passwordHash],
  );

  console.log('Admin ready:', rows[0]);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
