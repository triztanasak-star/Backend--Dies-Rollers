const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function runMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations');
  
  try {
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      console.log(`Đang chạy migration: ${file}...`);
      await pool.query(sql);
    }

    console.log('🎉 Đã chạy toàn bộ migrations lên Neon thành công!');
  } catch (err) {
    console.error('❌ Lỗi khi chạy migration:', err);
  } finally {
    await pool.end();
  }
}

runMigrations();