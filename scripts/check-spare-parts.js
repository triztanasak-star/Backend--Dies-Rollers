// Runs the real update handler against an existing record, then rolls back.
require('dotenv').config({ quiet: true });
const { Pool } = require('pg');
const makeRouter = require('../src/routes/spareParts.routes');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
(async () => {
  const connection = await pool.connect();
  try {
    const schema = await connection.query("SELECT column_name, data_type, character_maximum_length FROM information_schema.columns WHERE table_name = 'spare_parts' ORDER BY ordinal_position");
    console.log('Schema:', JSON.stringify(schema.rows));
    await connection.query('BEGIN');
    const { rows } = await connection.query('SELECT * FROM spare_parts ORDER BY id LIMIT 1');
    if (!rows.length) throw new Error('No spare part available for rollback verification');
    const body = { ...rows[0], image_after: rows[0].image_after || '', execution_plans: rows[0].execution_plans || [] };
    body.created_at = new Date(body.created_at).toISOString();
    for (const key of ['price_vnd', 'standard_ton', 'life_ton']) body[key] = Number(body[key]);
    const router = makeRouter({ db: { query: (...args) => connection.query(...args) },
      authMiddleware() {}, requireManagerOrAdmin() {}, logActivity: async () => {},
      handleServerError(_res, error) { throw error; } });
    const handler = router.stack.find(layer => layer.route?.methods.put).route.stack.at(-1).handle;
    const res = { status(code) { if (code >= 400) throw new Error(`HTTP ${code}`); return this; }, json() { console.log('Update verified successfully (rolling back)'); } };
    await handler({ body, params: { id: String(body.id) } }, res);
    const createHandler = router.stack.find(layer => layer.route?.methods.post).route.stack.at(-1).handle;
    await createHandler({ body: { ...body, equipment: 'Creation verification (rollback)', image_before: '', image_after: '', execution_plans: [] } }, {
      status(code) { if (code !== 201) throw new Error(`Create HTTP ${code}`); return this; },
      json(part) { if (!part.id) throw new Error('Create returned no ID'); console.log('Create verified with real database (rolling back)'); },
    });
    const publicHandler = router.stack.find(layer => layer.route?.path === '/api/spare-parts/:id/public').route.stack.at(-1).handle;
    await publicHandler({ params: { id: String(body.id) } }, {
      status(code) { throw new Error(`Public API HTTP ${code}`); },
      json(part) {
        if (part.id !== body.id || !part.equipment || !Array.isArray(part.execution_plans)) throw new Error('Invalid public part response');
        console.log('QR public API verified with database record (no login)');
      },
    });
  } finally {
    await connection.query('ROLLBACK'); connection.release(); await pool.end();
  }
})().catch(error => { console.error('Verification failed:', error.code || '', error.message); process.exitCode = 1; });
