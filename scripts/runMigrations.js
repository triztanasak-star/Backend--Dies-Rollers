// Chay lien tiep cac file migrations/001-006 theo thu tu. KHONG chay 999_smoke_test.sql (do la test tay).
// Dung 1 lan khi setup DB moi hoac sau khi them file migration moi.
//
// Chay: node scripts/runMigrations.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function main() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS "schema_migrations" (
      "filename" VARCHAR(255) PRIMARY KEY,
      "applied_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const { rows: appliedRows } = await db.query('SELECT filename FROM "schema_migrations"');
  const applied = new Set(appliedRows.map((r) => r.filename));

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f) && !f.startsWith('999_'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`-- Skipping ${file} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`-- Running ${file} ...`);
    await db.query(sql);
    await db.query('INSERT INTO "schema_migrations" (filename) VALUES ($1)', [file]);
    console.log(`   OK: ${file}`);
  }

  console.log('All migrations applied successfully.');
  process.exit(0);
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
